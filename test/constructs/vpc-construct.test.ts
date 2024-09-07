import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { VpcConstruct } from '../../lib/constructs/vpc-construct';
import { ConfigProvider } from '../../lib/utils/config-loader';

jest.mock('../../lib/utils/config-loader');

describe('VpcConstruct', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (ConfigProvider.getInstance as jest.Mock).mockReturnValue({
      getConfig: jest.fn().mockReturnValue({
        aws_region: 'us-east-1',
        vpc: {
          name: 'TestVPC',
          cidr: '10.24.0.0/16',
          maxAzs: 2,
          natGateways: 1,
          subnets: {
            public: { name: 'Public', cidr: 24 },
            private: { name: 'Private', cidr: 24 },
            db: { name: 'Database', cidr: 28 },
          },
        },
      }),
    });
  });

  test('VPC is created with correct properties', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');
    new VpcConstruct(stack, 'TestVPC', { env: 'dev' });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.24.0.0/16',
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
      InstanceTenancy: 'default',
      Tags: [{ Key: 'Name', Value: 'TestStack/TestVPC/dev-TestVPC' }],
    });

    template.resourceCountIs('AWS::EC2::Subnet', 6); // 2 AZs * 3 subnet types
    template.resourceCountIs('AWS::EC2::NatGateway', 1);
  });
});
