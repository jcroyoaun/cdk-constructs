import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
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
});