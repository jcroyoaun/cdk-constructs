import { App, Stack } from 'aws-cdk-lib';
import { Template, Match, Capture } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { EksConstruct } from '../../lib/constructs/eks-construct';
import { YamlReader } from '../../lib/utils/yaml-reader';

jest.mock('../../lib/utils/yaml-reader');
jest.mock('../../lib/utils/logger');

describe('EksConstruct', () => {
  let stack: Stack;
  let template: Template;

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
      eks: {
        clusterName: "ms-eks-dev",
        version: "1.30",
        NodeGroup: {
          instanceTypes: ["t3.medium", "t3.large"],
          minCapacity: 2,
          maxCapacity: 5,
          desiredCapacity: 3,
          diskSize: 20,
          capacityType: "ON_DEMAND",
        },
        adminAccess: {
          roleArnPrefix: "yourSSORole",
        },
        addOns: [
          { name: "coredns", version: "v1.11.3-eksbuild.1" },
          { name: "vpc-cni", version: "v1.18.3-eksbuild.3" },
          { name: "kube-proxy", version: "v1.30.3-eksbuild.5" },
          { name: "eks-pod-identity-agent", version: "v1.3.2-eksbuild.2" },
        ],
        awsLoadBalancerController: {
          namespace: "kube-system",
          serviceAccountName: "aws-load-balancer-controller",
          version: "1.5.3",
        },
        ebsCsiDriver: {
          namespace: "kube-system",
          serviceAccountName: "ebs-csi-controller-sa",
          version: "2.20.0",
        },
        metricsServer: {
          version: "3.12.1",
          namespace: "kube-system",
        },
        karpenter: {
          version: "1.0.6",
        },
      },
    });

    const app = new App();
    stack = new Stack(app, 'TestStack');
    const vpcConstruct = new ec2.Vpc(stack, 'TestVpc', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 20,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'DB',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });
    
    const config = YamlReader.readValue('dev');
    const props = {
      config: config.eks,
      env: 'dev',
      constructRefs: {
        vpc: { ec2Vpc: vpcConstruct },
      },
    };

    new EksConstruct(stack, 'TestEks', props);
    template = Template.fromStack(stack);
  });

  test('creates an EKS cluster with the correct configuration', () => {
    // Check for the Custom::AWSCDK-EKS-Cluster resource
    template.hasResourceProperties('Custom::AWSCDK-EKS-Cluster', {
      Config: Match.objectLike({
        name: 'ms-eks-dev',
        version: '1.30',
        resourcesVpcConfig: Match.objectLike({
          endpointPrivateAccess: true,
          endpointPublicAccess: true,
        }),
      }),
    });
  });


  test('creates a NodeGroup with the correct configuration', () => {
    template.hasResourceProperties('AWS::EKS::Nodegroup', {
      ClusterName: Match.anyValue(),
      NodeRole: Match.anyValue(),
      ScalingConfig: {
        DesiredSize: 3,
        MaxSize: 5,
        MinSize: 2,
      },
      DiskSize: 20,
      InstanceTypes: ['t3.medium', 't3.large'],
      Labels: {
        role: 'dev',
      },
    });
  });

  test('creates the specified add-ons', () => {
    const addons = [
      { name: 'coredns', version: 'v1.11.3-eksbuild.1' },
      { name: 'vpc-cni', version: 'v1.18.3-eksbuild.3' },
      { name: 'kube-proxy', version: 'v1.30.3-eksbuild.5' },
      { name: 'eks-pod-identity-agent', version: 'v1.3.2-eksbuild.2' },
    ];

    addons.forEach(addon => {
      template.hasResourceProperties('AWS::EKS::Addon', {
        AddonName: addon.name,
        AddonVersion: addon.version,
        ClusterName: Match.anyValue(),
      });
    });
  });

  test('creates AWS Load Balancer Controller', () => {
    template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Chart: 'aws-load-balancer-controller',
      Release: 'aws-load-balancer-controller',
      Namespace: 'kube-system',
      Version: '1.5.3',
    });
  });

  test('creates EBS CSI Driver', () => {
    template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Chart: 'aws-ebs-csi-driver',
      Release: 'aws-ebs-csi-driver',
      Namespace: 'kube-system',
      Version: '2.20.0',
    });
  });

  test('creates Metrics Server', () => {
    template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Chart: 'metrics-server',
      Release: 'metrics-server',
      Namespace: 'kube-system',
      Version: '3.12.1',
    });
  });

  test('creates Karpenter resources', () => {
    // Test for Karpenter SQS queue
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: Match.objectLike({
        Ref: Match.stringLikeRegexp('TestEksEksBaseConstruct.*')
      }),
      MessageRetentionPeriod: 300,
      SqsManagedSseEnabled: true
    });

    // Test for Karpenter IAM roles
    const rolePolicyCapture = new Capture();
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: Match.objectLike({
              Service: Match.anyValue()
            })
          })
        ])
      }),
      ManagedPolicyArns: rolePolicyCapture,
    });
  
    // Log captured policies for debugging
    console.log('Captured policies:', JSON.stringify(rolePolicyCapture.asArray(), null, 2));
  
    // Check for any Karpenter-related policies
    const capturedPolicies = rolePolicyCapture.asArray();
    const hasKarpenterPolicy = capturedPolicies.some(policy => 
      policy.toString().toLowerCase().includes('controller') ||
      policy.toString().toLowerCase().includes('eks')
    );
    
    expect(hasKarpenterPolicy).toBeFalsy();
  
  
  
    // Test for Karpenter Helm chart
    template.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Chart: 'karpenter',
      Release: 'karpenter',
      Namespace: 'kube-system',
      Version: '1.0.6',
      Values: Match.serializedJson(Match.objectLike({
        settings: {
          clusterName: Match.anyValue(),
          interruptionQueue: Match.anyValue(),
        },
      }))
    });
  });

  test('creates EventBridge rules for Karpenter with correct targets', () => {
    ['SpotInterruptionRule', 'RebalanceRule', 'InstanceStateChangeRule'].forEach(ruleName => {
      template.hasResourceProperties('AWS::Events::Rule', {
        EventPattern: Match.objectLike({
          source: ['aws.ec2'],
          'detail-type': Match.anyValue()
        }),
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: {
              'Fn::GetAtt': Match.arrayWith([Match.stringLikeRegexp('KarpenterInterruptionQueue')])
            },
            Id: 'Target0'
          })
        ])
      });
    });
  });

  test('creates Karpenter interruption queue policy', () => {
    template.hasResourceProperties('AWS::SQS::QueuePolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sqs:SendMessage',
            Effect: 'Allow',
            Principal: {
              Service: ['events.amazonaws.com', 'sqs.amazonaws.com']
            },
            Resource: Match.anyValue()
          }),
          Match.objectLike({
            Action: 'sqs:*',
            Effect: 'Deny',
            Principal: { AWS: '*' },
            Resource: Match.anyValue(),
            Condition: {
              Bool: { 'aws:SecureTransport': false }
            }
          })
        ])
      }
    });
  });


  test('tags subnets correctly', () => {
    ['Public', 'Private'].forEach(subnetType => {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        Tags: Match.arrayWith([
          {
            Key: 'kubernetes.io/cluster/ms-eks-dev',
            Value: 'shared',
          },
          {
            Key: `kubernetes.io/role/${subnetType.toLowerCase() === 'public' ? 'elb' : 'internal-elb'}`,
            Value: '1',
          },
        ]),
      });
    });
  });
});