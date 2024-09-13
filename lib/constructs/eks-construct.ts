import * as cdk from 'aws-cdk-lib';
import { aws_eks as eks, aws_ec2 as ec2, aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { EksBaseConstruct } from './eks-constructs/eks-base-construct';
import { EksAddonsConstruct } from './eks-constructs/eks-addons-construct';

export class EksConstruct extends Construct {
  public readonly cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props: any) {
    super(scope, id);
    
    // Read props from the passed parameters
    const clusterName = props.config.clusterName;
    const vpcRef = props.constructRefs.vpc.ec2Vpc;
    
    const baseConstruct = new EksBaseConstruct(this, 'EksBaseConstruct', 
          props, vpcRef);

    this.cluster = baseConstruct.cluster;
  
    // Tag the subnets after the cluster is created
    this.tagSubnets(vpcRef, clusterName);


   new EksAddonsConstruct(this, 'EksAddons', props, baseConstruct.cluster, vpcRef);
  }
  
  private tagSubnets(vpc: ec2.IVpc, clusterName: string) {
    vpc.publicSubnets.forEach(subnet => {
      cdk.Tags.of(subnet).add(`kubernetes.io/cluster/${clusterName}`, 'shared');
      cdk.Tags.of(subnet).add('kubernetes.io/role/elb', '1');
    });

    vpc.privateSubnets.forEach(subnet => {
      cdk.Tags.of(subnet).add(`kubernetes.io/cluster/${clusterName}`, 'shared');
      cdk.Tags.of(subnet).add('kubernetes.io/role/internal-elb', '1');
    });
  }

}


