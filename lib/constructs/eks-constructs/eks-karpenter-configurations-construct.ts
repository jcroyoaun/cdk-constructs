import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_eks as eks, aws_ec2 as ec2, aws_ssm as ssm } from 'aws-cdk-lib';


export class KarpenterConfigurationsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: any, cluster: eks.Cluster, vpcRef: ec2.IVpc) {
    super(scope, id);
    
    const karpenterConfig = props.config.karpenter;
    const clusterName = props.config.clusterName;
    const k8sVersion = props.config.version;

    const amdAmiId = ssm.StringParameter.valueForStringParameter(this, 
      `/aws/service/eks/optimized-ami/${k8sVersion}/amazon-linux-2/recommended/image_id`
    );

    new eks.KubernetesManifest(this, 'EC2NodeClassManifest', {
      cluster: cluster,
      manifest: [{
        apiVersion: 'karpenter.k8s.aws/v1',
        kind: 'EC2NodeClass',
        metadata: {
          name: `${clusterName}-nodeclass`
        },
        spec: {
          amiFamily: 'AL2',
          role: `${karpenterConfig.nodeRole}-${clusterName}`,
          subnetSelectorTerms: [{
            tags: {
              'karpenter.sh/discovery': clusterName
            },
          }],
          securityGroupSelectorTerms: [{
            id: cluster.clusterSecurityGroupId
          }],
          amiSelectorTerms: [{
            id: amdAmiId
          }]
        }
      }]
    });

    new eks.KubernetesManifest(this, 'NodePoolManifest', {
      cluster: cluster,
      manifest: [{
        apiVersion: 'karpenter.sh/v1',
        kind: 'NodePool',
        metadata: { name: `${clusterName}-nodepool` },
        spec: {
          template: {
            spec: {
              requirements: [
                { key: 'kubernetes.io/arch', operator: 'In', values: [karpenterConfig.nodePool.arch] },
                { key: 'kubernetes.io/os', operator: 'In', values: [karpenterConfig.nodePool.os] },
                { key: 'karpenter.sh/capacity-type', operator: 'In', values: [karpenterConfig.nodePool.capacityType] },
                { key: 'karpenter.k8s.aws/instance-category', operator: 'In', values: karpenterConfig.nodePool.instanceCategories },
                { key: 'karpenter.k8s.aws/instance-generation', operator: 'Gt', values: [karpenterConfig.nodePool.instanceGeneration] },
              ],
              nodeClassRef: {
                group: 'karpenter.k8s.aws',
                kind: 'EC2NodeClass',
                name: `${clusterName}-nodeclass`,
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
      }]
    });
  }
}