import * as cdk from 'aws-cdk-lib';
import { aws_elasticloadbalancingv2 as elbv2, aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { InstrideTagger } from '../utils/tagging';
import { logger } from '../utils/logger';

export class NlbConstruct extends Construct {
  public readonly internalNlb: elbv2.NetworkLoadBalancer;
  public readonly externalNlb: elbv2.NetworkLoadBalancer;

  constructor(scope: Construct, id: string, props: any) {
    super(scope, id);

    const nlbConfig = props.config;
    const vpcRef = props.constructRefs.vpc.ec2Vpc;

    try {
      logger.info('Starting Network Load Balancers creation', 'NlbConstruct');
      
      this.internalNlb = this.createNetworkLoadBalancer(vpcRef, nlbConfig.internal, nlbConfig.common, 'internal');
      this.externalNlb = this.createNetworkLoadBalancer(vpcRef, nlbConfig.external, nlbConfig.common, 'external');
      
      //this.addTags(props);
      
      logger.success('Network Load Balancers created successfully', 'NlbConstruct');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error creating Network Load Balancers: ${errorMessage}`, 'NlbConstruct');
      throw new Error(`Error creating Network Load Balancers: ${errorMessage}\nPlease check your NLB configuration in the YAML file.`);
    }
  }

  private createNetworkLoadBalancer(vpc: ec2.IVpc, nlbConfig: any, commonConfig: any, type: string): elbv2.NetworkLoadBalancer {
    logger.info(`Creating ${type} Network Load Balancer: ${nlbConfig.name}`, 'NlbConstruct');
    
    return new elbv2.NetworkLoadBalancer(this, nlbConfig.name, {
      loadBalancerName: nlbConfig.name,
      vpc,
      internetFacing: nlbConfig.scheme === 'internet-facing',
      vpcSubnets: { subnetType: ec2.SubnetType[nlbConfig.subnetType as keyof typeof ec2.SubnetType] },
      crossZoneEnabled: true,
      ipAddressType: commonConfig.ipAddressType as elbv2.IpAddressType,
    });
  }

  private addTags(props: any) {
    const internalResourceName = `${props.config.nlb.internal.name}-nlb`;
    const externalResourceName = `${props.config.nlb.external.name}-nlb`;
    
    InstrideTagger.tagResources([this.internalNlb], internalResourceName, props);
    InstrideTagger.tagResources([this.externalNlb], externalResourceName, props);
  }
}