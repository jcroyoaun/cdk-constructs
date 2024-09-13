import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { SubnetNamingUtil } from '../utils/subnet-naming-util';
import { InstrideTagger } from '../utils/instride-tagging';

export class VpcConstruct extends Construct {
  public readonly ec2Vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: any) {
    super(scope, id);

    const vpcConfig = props.config;

    this.ec2Vpc = new ec2.Vpc(this, `${vpcConfig.name}`, {
      vpcName: vpcConfig.name,
      maxAzs: vpcConfig.maxAzs,
      ipAddresses: ec2.IpAddresses.cidr(vpcConfig.cidr),
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

    // Set the VPC name using tags (crucial for custom naming)
    const vpcName = SubnetNamingUtil.getVpcName(vpcConfig.name);
    
    // Use InstrideTagger to add common tags to VPC, but preserve the 'Name' tag
    InstrideTagger.tagResource(this.ec2Vpc, vpcName, props);

    // Set the VPC name
    cdk.Tags.of(this.ec2Vpc).add('Name', vpcName);
    cdk.Tags.of(this.ec2Vpc).add('Name', SubnetNamingUtil.getVpcName(vpcConfig.name));

    // Set subnet names
    this.ec2Vpc.publicSubnets.forEach((subnet, index) => {
      cdk.Tags.of(subnet).add('Name', SubnetNamingUtil.getSubnetName(vpcConfig.name, vpcConfig.subnets.public.name, index));
    });

    this.ec2Vpc.privateSubnets.forEach((subnet, index) => {
      cdk.Tags.of(subnet).add('Name', SubnetNamingUtil.getSubnetName(vpcConfig.name, vpcConfig.subnets.private.name, index));
    });

    this.ec2Vpc.isolatedSubnets.forEach((subnet, index) => {
      cdk.Tags.of(subnet).add('Name', SubnetNamingUtil.getSubnetName(vpcConfig.name, vpcConfig.subnets.db.name, index));
    });
  }
}