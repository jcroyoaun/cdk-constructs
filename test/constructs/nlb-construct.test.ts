import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { NlbConstruct } from '../../lib/constructs/nlb-construct';
import { YamlReader } from '../../lib/utils/yaml-reader';
import { VpcConstruct } from '../../lib/constructs/vpc-construct';

jest.mock('../../lib/utils/yaml-reader');
jest.mock('../../lib/utils/logger');

describe('NlbConstruct', () => {
  let app: App;
  let stack: Stack;
  let template: Template;
  let vpc: ec2.Vpc;

  beforeEach(() => {
    jest.resetAllMocks();
    (YamlReader.readValue as jest.Mock).mockReturnValue({
      aws_account: "637423635181",
      aws_region: "us-east-1",
      vpc: {
        name: "vpc-dev",
        cidr: "10.24.0.0/16",
        maxAzs: 2,
        natGateways: 1,
        subnets: {
          public: { name: "Public", cidr: 24 },
          private: { name: "Private", cidr: 20 },
          db: { name: "DB", cidr: 24 },
        },
      },
      nlb: {
        internal: {
          name: 'instride-nlb-int-dev',
          scheme: 'internal',
          subnetType: 'PRIVATE_WITH_EGRESS',
        },
        external: {
          name: 'instride-nlb-ext-dev',
          scheme: 'internet-facing',
          subnetType: 'PUBLIC',
        },
        common: {
          type: 'network',
          ipAddressType: 'ipv4',
        },
      },
    });

    const config = YamlReader.readValue('dev');

    app = new App();
    stack = new Stack(app, 'TestStack');
    const vpcConstruct = new VpcConstruct(stack, 'TestVpc', { config: config.vpc, env: 'dev' });
    vpc = vpcConstruct.ec2Vpc;
    
    const props = {
      config: config.nlb,
      env: 'dev',
      constructRefs: {
        vpc: { ec2Vpc: vpc },
      },
    };

    new NlbConstruct(stack, 'TestNlb', props);
    template = Template.fromStack(stack);
  });

  test('creates two Network Load Balancers', () => {
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 2);
  });

  test('creates an internal NLB with the correct configuration', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Name: 'instride-nlb-int-dev',
      Scheme: 'internal',
      Type: 'network',
      IpAddressType: 'ipv4',
      Subnets: Match.anyValue(),
      LoadBalancerAttributes: Match.arrayWith([
        {
          Key: 'load_balancing.cross_zone.enabled',
          Value: 'true'
        }
      ])
    });
  });

  test('creates an external NLB with the correct configuration', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Name: 'instride-nlb-ext-dev',
      Scheme: 'internet-facing',
      Type: 'network',
      IpAddressType: 'ipv4',
      Subnets: Match.anyValue(),
      LoadBalancerAttributes: Match.arrayWith([
        {
          Key: 'load_balancing.cross_zone.enabled',
          Value: 'true'
        }
      ])
    });
  });

  test('internal NLB is in private subnets', () => {
    const internalNlbs = template.findResources('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Properties: {
        Scheme: 'internal',
      }
    });

    const privateSubnets = template.findResources('AWS::EC2::Subnet', {
      Properties: {
        MapPublicIpOnLaunch: false,
      }
    });

    const internalNlbLogicalId = Object.keys(internalNlbs)[0];
    const internalNlbSubnets = internalNlbs[internalNlbLogicalId].Properties.Subnets;
    
    // Only include private subnets with egress, not DB subnets
    const privateSubnetRefs = Object.keys(privateSubnets)
      .filter(id => id.includes('Private'))
      .map(id => ({ Ref: id }));
    
    expect(internalNlbSubnets).toEqual(expect.arrayContaining(privateSubnetRefs));
    expect(internalNlbSubnets.length).toBe(privateSubnetRefs.length);
  });


  test('external NLB is in public subnets', () => {
    const externalNlbs = template.findResources('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Properties: {
        Name: 'instride-nlb-ext-dev',
        Scheme: 'internet-facing',
      }
    });

    const publicSubnets = template.findResources('AWS::EC2::Subnet', {
      Properties: {
        MapPublicIpOnLaunch: true,
      }
    });

    const externalNlbLogicalId = Object.keys(externalNlbs)[0];
    const externalNlbSubnets = externalNlbs[externalNlbLogicalId].Properties.Subnets;
    const publicSubnetRefs = Object.keys(publicSubnets).map(id => ({ Ref: id }));
    
    expect(externalNlbSubnets).toEqual(expect.arrayContaining(publicSubnetRefs));
  });
});