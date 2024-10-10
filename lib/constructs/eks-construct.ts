import * as cdk from 'aws-cdk-lib';
import { aws_eks as eks, aws_ec2 as ec2, aws_ssm as ssm } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EksBaseConstruct } from './eks-constructs/eks-base-construct';
import { EksAddonsConstruct } from './eks-constructs/eks-addons-construct';
import { KarpenterConstruct } from './eks-constructs/eks-karpenter-construct';
import * as cdk8s from 'cdk8s';
import { ApiObject } from 'cdk8s';

export class EksConstruct extends Construct {
  public readonly cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props: any) {
    super(scope, id);
    
    // Read props from the passed parameters
    const clusterName = props.config.clusterName;
    const k8sVersion = props.config.version;
    const vpcRef = props.constructRefs.vpc.ec2Vpc;
    
    const baseConstruct = new EksBaseConstruct(this, 'EksBaseConstruct', props, vpcRef);
    this.cluster = baseConstruct.cluster;

    // Tag the subnets after the cluster is created
    this.tagSubnets(vpcRef, clusterName);

    const addonsConstruct = new EksAddonsConstruct(this, 'EksAddons', props, baseConstruct.cluster, vpcRef);

    // Create Karpenter construct and add dependencies
    const karpenterConstruct = new KarpenterConstruct(this, 'KarpenterConstruct', props, baseConstruct.cluster, vpcRef);

    // Ensure Karpenter is installed after the base EKS construct and addons
    karpenterConstruct.node.addDependency(baseConstruct);
    karpenterConstruct.node.addDependency(addonsConstruct);

    const amdAmiId = ssm.StringParameter.valueForStringParameter(this, 
      `/aws/service/eks/optimized-ami/${k8sVersion}/amazon-linux-2/recommended/image_id`
    );


    // Create a new CDK8s app separately
    const cdk8sApp = new cdk8s.App();

    // Create a new CDK8s chart linked to the CDK8s app (not the AWS CDK scope)
    const karpenterResourcesChart = new cdk8s.Chart(cdk8sApp, 'KarpenterResourcesChart');

    // Add EC2NodeClass and NodePool to the chart as ApiObjects
    new EC2NodeClass(karpenterResourcesChart, 'EC2NodeClass', {
      clusterName: clusterName,
      nodeRoleName: `KarpenterNodeRole-${clusterName}`,
      amdAmiId: amdAmiId,
    });
    
    new NodePool(karpenterResourcesChart, 'NodePool');

    // Synthesize the CDK8s app before adding it to the cluster
    cdk8sApp.synth();

    // Add the synthesized CDK8s chart to the EKS cluster
    baseConstruct.cluster.addCdk8sChart('KarpenterResourcesChart', karpenterResourcesChart);
    karpenterResourcesChart.addDependency(karpenterConstruct);
  }

  private tagSubnets(vpc: ec2.IVpc, clusterName: string) {
    vpc.publicSubnets.forEach(subnet => {
      cdk.Tags.of(subnet).add(`kubernetes.io/cluster/${clusterName}`, 'shared');
      cdk.Tags.of(subnet).add('kubernetes.io/role/elb', '1');
      cdk.Tags.of(subnet).add(`karpenter.sh/discovery`, clusterName);
    });

    vpc.privateSubnets.forEach(subnet => {
      cdk.Tags.of(subnet).add(`kubernetes.io/cluster/${clusterName}`, 'shared');
      cdk.Tags.of(subnet).add('kubernetes.io/role/internal-elb', '1');
      cdk.Tags.of(subnet).add(`karpenter.sh/discovery`, clusterName);
    });
  }
}

class EC2NodeClass extends Construct {
  constructor(scope: Construct, id: string, props: { clusterName: string, nodeRoleName: string, amdAmiId: string }) {
    super(scope, id);

    new ApiObject(this, 'EC2NodeClass', {
      apiVersion: 'karpenter.k8s.aws/v1',
      kind: 'EC2NodeClass',
      metadata: { name: 'default' },
      spec: {
        amiFamily: 'AL2',
        role: props.nodeRoleName,
        subnetSelectorTerms: [{ tags: { 'karpenter.sh/discovery': props.clusterName } }],
        securityGroupSelectorTerms: [{ tags: { 'karpenter.sh/discovery': props.clusterName } }],
        amiSelectorTerms: [
          { id: props.amdAmiId },
        ],
      },
    });
  }
}

class NodePool extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new ApiObject(this, 'NodePool', {
      apiVersion: 'karpenter.sh/v1',
      kind: 'NodePool',
      metadata: { name: 'default' },
      spec: {
        template: {
          spec: {
            requirements: [
              { key: 'kubernetes.io/arch', operator: 'In', values: ['amd64'] },
              { key: 'kubernetes.io/os', operator: 'In', values: ['linux'] },
              { key: 'karpenter.sh/capacity-type', operator: 'In', values: ['on-demand'] },
              { key: 'karpenter.k8s.aws/instance-category', operator: 'In', values: ['c', 'm', 'r'] },
              { key: 'karpenter.k8s.aws/instance-generation', operator: 'Gt', values: ['2'] },
            ],
            nodeClassRef: {
              group: 'karpenter.k8s.aws',
              kind: 'EC2NodeClass',
              name: 'default',
            },
          },
        },
        limits: {
          cpu: 60,
          memory: '160Gi',
        },
        disruption: {
          consolidationPolicy: 'WhenEmptyOrUnderutilized',
          consolidateAfter: '1m',
        },
      },
    });
  }
}
