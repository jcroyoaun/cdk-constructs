import * as cdk from 'aws-cdk-lib';
import { aws_eks as eks, aws_ec2 as ec2, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EksBaseConstruct } from './eks-constructs/eks-base-construct';
import { EksAddonsConstruct } from './eks-constructs/eks-addons-construct';
import { KarpenterConstruct } from './eks-constructs/eks-karpenter-construct';
import { KarpenterConfigurationsConstruct } from './eks-constructs/eks-karpenter-configurations-construct';

export class EksConstruct extends Construct {
  public readonly cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props: any) {
    super(scope, id);
    
    const { clusterName } = props.config;
    const vpcRef = props.constructRefs.vpc.ec2Vpc;
    
    const baseConstruct = this.createBaseConstruct(props, vpcRef);
    this.cluster = baseConstruct.cluster;

    const addonsConstruct = this.createAddonsConstruct(props, baseConstruct, vpcRef);
    const karpenterConstruct = this.createKarpenterConstruct(props, baseConstruct, addonsConstruct, vpcRef);
    
    this.tagSubnets(vpcRef, clusterName);
    
    this.createKarpenterConfigurationsConstruct(props, karpenterConstruct, vpcRef);
  }

  private createBaseConstruct(props: any, vpcRef: ec2.IVpc): EksBaseConstruct {
    return new EksBaseConstruct(this, 'EksBaseConstruct', props, vpcRef);
  }

  private createAddonsConstruct(props: any, baseConstruct: EksBaseConstruct, vpcRef: ec2.IVpc): EksAddonsConstruct {
    const addonsConstruct = new EksAddonsConstruct(this, 'EksAddons', props, baseConstruct.cluster, vpcRef);
    addonsConstruct.node.addDependency(baseConstruct);
    return addonsConstruct;
  }

  private createKarpenterConstruct(props: any, baseConstruct: EksBaseConstruct, addonsConstruct: EksAddonsConstruct, vpcRef: ec2.IVpc): KarpenterConstruct {
    const karpenterConstruct = new KarpenterConstruct(this, 'KarpenterConstruct', props, baseConstruct.cluster, vpcRef);
    karpenterConstruct.node.addDependency(baseConstruct);
    karpenterConstruct.node.addDependency(addonsConstruct);
    return karpenterConstruct;
  }

  private createKarpenterConfigurationsConstruct(props: any, karpenterConstruct: KarpenterConstruct, vpcRef: ec2.IVpc): void {
    const karpenterConfigurationsConstruct = new KarpenterConfigurationsConstruct(this, 'KarpenterConfigurationsConstruct', props, this.cluster, vpcRef);
    karpenterConfigurationsConstruct.node.addDependency(karpenterConstruct);
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