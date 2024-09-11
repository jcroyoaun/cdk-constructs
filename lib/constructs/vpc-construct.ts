import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class VpcConstruct extends Construct {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: any) {
    super(scope, id);

    const vpcConfig = props.config;

    this.vpc = new ec2.Vpc(this, `${props.env}-${vpcConfig.name}`, {
      ipAddresses: ec2.IpAddresses.cidr(vpcConfig.cidr),
      maxAzs: vpcConfig.maxAzs,
      natGateways: vpcConfig.natGateways,
      subnetConfiguration: [
        {
          cidrMask: vpcConfig.subnets.public.cidr,
          name: vpcConfig.subnets.public.name,
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: vpcConfig.subnets.private.cidr,
          name: vpcConfig.subnets.private.name,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: vpcConfig.subnets.db.cidr,
          name: vpcConfig.subnets.db.name,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });
  }
}
