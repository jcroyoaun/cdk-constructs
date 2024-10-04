import { Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { VpcConstruct } from '../../lib/constructs/vpc-construct';

describe('VpcConstruct', () => {
  let stack: Stack;
  let template: Template;

  beforeEach(() => {
    stack = new Stack();
    const props = {
      config: {
        name: 'vpc-develop',
        cidr: '10.24.0.0/16',
        maxAzs: 2,
        natGateways: 1,
        subnets: {
          public: { name: 'Public', cidr: 24 },
          private: { name: 'Private', cidr: 20 },
          db: { name: 'DB', cidr: 24 },
        },
      },
      env: 'develop',
    };

    new VpcConstruct(stack, 'TestVpc', props);
    template = Template.fromStack(stack);
  });

  test('creates a VPC with the correct configuration', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.24.0.0/16',
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
      InstanceTenancy: 'default',
    });
  });

  test('creates the correct number of subnets', () => {
    template.resourceCountIs('AWS::EC2::Subnet', 6);
  });

  test('creates public subnets with the correct configuration', () => {
    template.hasResourceProperties('AWS::EC2::Subnet', {
      CidrBlock: Match.stringLikeRegexp('^10.24.[0-1].[0-9]+/24$'),
      MapPublicIpOnLaunch: true,
      Tags: Match.arrayWith([
        { Key: 'Name', Value: Match.stringLikeRegexp('vpc-develop-Public-[a-b]') },
      ]),
    });
  });

  test('creates private subnets with the correct configuration', () => {
    template.hasResourceProperties('AWS::EC2::Subnet', {
      CidrBlock: Match.stringLikeRegexp('^10.24.(16|32).[0-9]+/20$'),
      MapPublicIpOnLaunch: false,
      Tags: Match.arrayWith([
        { Key: 'Name', Value: Match.stringLikeRegexp('vpc-develop-Private-[a-b]') },
      ]),
    });
  });

  test('creates DB subnets with the correct configuration', () => {
    template.hasResourceProperties('AWS::EC2::Subnet', {
      CidrBlock: Match.stringLikeRegexp('^10.24.(48|49).[0-9]+/24$'),
      MapPublicIpOnLaunch: false,
      Tags: Match.arrayWith([
        { Key: 'Name', Value: Match.stringLikeRegexp('vpc-develop-DB-[a-b]') },
      ]),
    });
  });

  test('creates a NAT Gateway', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 1);
  });

  test('creates an Internet Gateway', () => {
    template.resourceCountIs('AWS::EC2::InternetGateway', 1);
  });

  test('creates route tables for each subnet', () => {
    template.resourceCountIs('AWS::EC2::RouteTable', 6);
  });

  test('creates a route to the Internet Gateway in the public route tables', () => {
    template.hasResourceProperties('AWS::EC2::Route', {
      DestinationCidrBlock: '0.0.0.0/0',
      GatewayId: {
        Ref: Match.stringLikeRegexp('TestVpcvpcdevelopIGW'),
      },
      RouteTableId: {
        Ref: Match.stringLikeRegexp('TestVpcvpcdevelopPublicSubnet[12]RouteTable'),
      },
    });
  });

  test('creates a route to the NAT Gateway in the private route tables', () => {
    template.hasResourceProperties('AWS::EC2::Route', {
      DestinationCidrBlock: '0.0.0.0/0',
      NatGatewayId: {
        Ref: Match.stringLikeRegexp('TestVpcvpcdevelopPublicSubnet1NATGateway'),
      },
      RouteTableId: {
        Ref: Match.stringLikeRegexp('TestVpcvpcdevelopPrivateSubnet[12]RouteTable'),
      },
    });
  });
});