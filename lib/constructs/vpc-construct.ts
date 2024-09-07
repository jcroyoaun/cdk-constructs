import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { ConfigProvider } from '../utils/config-loader';

export interface VpcConstructProps {
  env: string;
}

export class VpcConstruct extends Construct {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);

    const config = ConfigProvider.getInstance(props.env).getConfig();
    const vpcConfig = config.vpc;

    if (!vpcConfig) {
      throw new Error('VPC configuration not found');
    }

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
