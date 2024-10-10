import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { aws_eks as eks, aws_ec2 as ec2, CfnJson } from 'aws-cdk-lib';

export class KarpenterConstruct extends Construct {
  constructor(scope: Construct, id: string, props: any, cluster: eks.Cluster, vpcRef: ec2.IVpc) {
    super(scope, id);

    const region = props.awsEnv.region;
    const accountId = props.awsEnv.account;
    const eksConfig = props.config;
    

    const karpenterInterruptionQueue = new sqs.Queue(this, 'KarpenterInterruptionQueue', {
      queueName: cluster.clusterName,
      retentionPeriod: cdk.Duration.seconds(300),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    const karpenterInterruptionQueuePolicy = new sqs.QueuePolicy(this, 'KarpenterInterruptionQueuePolicy', {
      queues: [karpenterInterruptionQueue],
    });

    const karpenterNodeRole = new iam.Role(this, 'KarpenterNodeRole', {
      roleName: `KarpenterNodeRole-${cluster.clusterName}`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('ElasticLoadBalancingFullAccess'),
      ],
    });

    new eks.AccessEntry(this, 'KarpenterNodeRoleAccessEntry', {
      cluster: cluster,
      principal: karpenterNodeRole.roleArn,
      accessEntryType: eks.AccessEntryType.EC2_LINUX,
      accessPolicies: [
        eks.AccessPolicy.fromAccessPolicyName('system:node', {
          accessScopeType: eks.AccessScopeType.CLUSTER,
        }),
      ],
    });


    const clusterNameJson = new CfnJson(this, 'ClusterName', {
      value: cluster.clusterName,
    });

    const karpenterControllerPolicy = new iam.ManagedPolicy(this, 'KarpenterControllerPolicy', {
      managedPolicyName: `KarpenterControllerPolicy-${cluster.clusterName}`,
      statements: [
        new iam.PolicyStatement({
          sid: 'AllowScopedEC2InstanceAccessActions',
          effect: iam.Effect.ALLOW,
          actions: ['ec2:RunInstances', 'ec2:CreateFleet'],
          resources: [
            `arn:aws:ec2:${region}::image/*`,
            `arn:aws:ec2:${region}::snapshot/*`,
            `arn:aws:ec2:${region}:*:security-group/*`,
            `arn:aws:ec2:${region}:*:subnet/*`,
          ],
        }),
        new iam.PolicyStatement({
          sid: 'AllowScopedEC2LaunchTemplateAccessActions',
          effect: iam.Effect.ALLOW,
          actions: ['ec2:RunInstances', 'ec2:CreateFleet'],
          resources: [`arn:aws:ec2:${region}:*:launch-template/*`],
          conditions: {
            StringEquals: {
              [`aws:ResourceTag/kubernetes.io/cluster/${eksConfig.clusterName}`]: 'owned',
            },
            StringLike: {
              'aws:ResourceTag/karpenter.sh/nodepool': '*',
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'AllowScopedEC2InstanceActionsWithTags',
          effect: iam.Effect.ALLOW,
          actions: ['ec2:RunInstances', 'ec2:CreateFleet', 'ec2:CreateLaunchTemplate'],
          resources: [
            `arn:aws:ec2:${region}:*:fleet/*`,
            `arn:aws:ec2:${region}:*:instance/*`,
            `arn:aws:ec2:${region}:*:volume/*`,
            `arn:aws:ec2:${region}:*:network-interface/*`,
            `arn:aws:ec2:${region}:*:launch-template/*`,
            `arn:aws:ec2:${region}:*:spot-instances-request/*`,
          ],
          conditions: {
            StringEquals: {
              [`aws:RequestTag/kubernetes.io/cluster/${eksConfig.clusterName}`]: 'owned',
              'aws:RequestTag/eks:eks-cluster-name': eksConfig.clusterName,
            },
            StringLike: {
              'aws:RequestTag/karpenter.sh/nodepool': '*',
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'AllowScopedResourceCreationTagging',
          effect: iam.Effect.ALLOW,
          actions: ['ec2:CreateTags'],
          resources: [
            `arn:aws:ec2:${region}:*:fleet/*`,
            `arn:aws:ec2:${region}:*:instance/*`,
            `arn:aws:ec2:${region}:*:volume/*`,
            `arn:aws:ec2:${region}:*:network-interface/*`,
            `arn:aws:ec2:${region}:*:launch-template/*`,
            `arn:aws:ec2:${region}:*:spot-instances-request/*`,
          ],
          conditions: {
            StringEquals: {
              [`aws:RequestTag/kubernetes.io/cluster/${eksConfig.clusterName}`]: 'owned',
              'aws:RequestTag/eks:eks-cluster-name': eksConfig.clusterName,
              'ec2:CreateAction': ['RunInstances', 'CreateFleet', 'CreateLaunchTemplate'],
            },
            StringLike: {
              'aws:RequestTag/karpenter.sh/nodepool': '*',
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'AllowScopedResourceTagging',
          effect: iam.Effect.ALLOW,
          actions: ['ec2:CreateTags'],
          resources: [`arn:aws:ec2:${region}:*:instance/*`],
          conditions: {
            StringEquals: {
              [`aws:ResourceTag/kubernetes.io/cluster/${eksConfig.clusterName}`]: 'owned',
            },
            StringLike: {
              'aws:ResourceTag/karpenter.sh/nodepool': '*',
            },
            StringEqualsIfExists: {
              'aws:RequestTag/eks:eks-cluster-name': eksConfig.clusterName,
            },
            'ForAllValues:StringEquals': {
              'aws:TagKeys': ['eks:eks-cluster-name', 'karpenter.sh/nodeclaim', 'Name'],
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'AllowScopedDeletion',
          effect: iam.Effect.ALLOW,
          actions: ['ec2:TerminateInstances', 'ec2:DeleteLaunchTemplate'],
          resources: [
            `arn:aws:ec2:${region}:*:instance/*`,
            `arn:aws:ec2:${region}:*:launch-template/*`,
          ],
          conditions: {
            StringEquals: {
              [`aws:ResourceTag/kubernetes.io/cluster/${eksConfig.clusterName}`]: 'owned',
            },
            StringLike: {
              'aws:ResourceTag/karpenter.sh/nodepool': '*',
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'AllowRegionalReadActions',
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:DescribeAvailabilityZones',
            'ec2:DescribeImages',
            'ec2:DescribeInstances',
            'ec2:DescribeInstanceTypeOfferings',
            'ec2:DescribeInstanceTypes',
            'ec2:DescribeLaunchTemplates',
            'ec2:DescribeSecurityGroups',
            'ec2:DescribeSpotPriceHistory',
            'ec2:DescribeSubnets',
          ],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'aws:RequestedRegion': region,
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'AllowSSMReadActions',
          effect: iam.Effect.ALLOW,
          actions: ['ssm:GetParameter'],
          resources: [`arn:aws:ssm:${region}::parameter/aws/service/*`],
        }),
        new iam.PolicyStatement({
          sid: 'AllowPricingReadActions',
          effect: iam.Effect.ALLOW,
          actions: ['pricing:GetProducts'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          sid: 'AllowInterruptionQueueActions',
          effect: iam.Effect.ALLOW,
          actions: ['sqs:DeleteMessage', 'sqs:GetQueueUrl', 'sqs:ReceiveMessage'],
          resources: [karpenterInterruptionQueue.queueArn],
        }),
        new iam.PolicyStatement({
          sid: 'AllowPassingInstanceRole',
          effect: iam.Effect.ALLOW,
          actions: ['iam:PassRole'],
          resources: [karpenterNodeRole.roleArn],
          conditions: {
            StringEquals: {
              'iam:PassedToService': 'ec2.amazonaws.com',
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'AllowScopedInstanceProfileCreationActions',
          effect: iam.Effect.ALLOW,
          actions: ['iam:CreateInstanceProfile'],
          resources: [`arn:aws:iam::${accountId}:instance-profile/*`],
          conditions: {
            StringEquals: {
              [`aws:RequestTag/kubernetes.io/cluster/${eksConfig.clusterName}`]: 'owned',
              'aws:RequestTag/eks:eks-cluster-name': eksConfig.clusterName,
              'aws:RequestTag/topology.kubernetes.io/region': region,
            },
            StringLike: {
              'aws:RequestTag/karpenter.k8s.aws/ec2nodeclass': '*',
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'AllowScopedInstanceProfileTagActions',
          effect: iam.Effect.ALLOW,
          actions: ['iam:TagInstanceProfile'],
          resources: [`arn:aws:iam::${accountId}:instance-profile/*`],
          conditions: {
            StringEquals: {
              [`aws:ResourceTag/kubernetes.io/cluster/${eksConfig.clusterName}`]: 'owned',
              'aws:ResourceTag/topology.kubernetes.io/region': region,
              [`aws:RequestTag/kubernetes.io/cluster/${eksConfig.clusterName}`]: 'owned',
              'aws:RequestTag/eks:eks-cluster-name': eksConfig.clusterName,
              'aws:RequestTag/topology.kubernetes.io/region': region,
            },
            StringLike: {
              'aws:ResourceTag/karpenter.k8s.aws/ec2nodeclass': '*',
              'aws:RequestTag/karpenter.k8s.aws/ec2nodeclass': '*',
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'AllowScopedInstanceProfileActions',
          effect: iam.Effect.ALLOW,
          actions: ['iam:AddRoleToInstanceProfile', 'iam:RemoveRoleFromInstanceProfile', 'iam:DeleteInstanceProfile'],
          resources: [`arn:aws:iam::${accountId}:instance-profile/*`],
          conditions: {
            StringEquals: {
              [`aws:ResourceTag/kubernetes.io/cluster/${eksConfig.clusterName}`]: 'owned',
              'aws:ResourceTag/topology.kubernetes.io/region': region,
            },
            StringLike: {
              'aws:ResourceTag/karpenter.k8s.aws/ec2nodeclass': '*',
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'AllowInstanceProfileReadActions',
          effect: iam.Effect.ALLOW,
          actions: ['iam:GetInstanceProfile'],
          resources: [`arn:aws:iam::${accountId}:instance-profile/*`],
        }),
        new iam.PolicyStatement({
          sid: 'AllowAPIServerEndpointDiscovery',
          effect: iam.Effect.ALLOW,
          actions: ['eks:DescribeCluster'],
          resources: [`arn:aws:eks:${region}:${accountId}:cluster/${cluster.clusterName}`],
        }),
      ],
    });

    const karpenterPodRole = new iam.Role(this, 'KarpenterPodRole', {
      roleName: `${cluster.clusterName}-karpenter`,
      assumedBy: new iam.ServicePrincipal('pods.eks.amazonaws.com')
    });

    karpenterPodRole.assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole', 'sts:TagSession'],
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('pods.eks.amazonaws.com')],
      })
    );

    karpenterPodRole.addManagedPolicy(karpenterControllerPolicy);

    new eks.CfnPodIdentityAssociation(this, 'KarpenterPodIdentityAssociation', {
      clusterName: cluster.clusterName,
      namespace: 'kube-system',
      serviceAccount: 'karpenter',
      roleArn: karpenterPodRole.roleArn
    });

    karpenterInterruptionQueuePolicy.document.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.ServicePrincipal('events.amazonaws.com'),
          new iam.ServicePrincipal('sqs.amazonaws.com'),
        ],
        actions: ['sqs:SendMessage'],
        resources: [karpenterInterruptionQueue.queueArn],
      }),
      new iam.PolicyStatement({
        sid: 'DenyHTTP',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['sqs:*'],
        resources: [karpenterInterruptionQueue.queueArn],
        conditions: {
          Bool: {
            'aws:SecureTransport': false,
          },
        },
      })
    );

    const createEventRule = (id: string, eventPattern: events.EventPattern) => {
      new events.Rule(this, id, {
        eventPattern,
        targets: [new targets.SqsQueue(karpenterInterruptionQueue)],
      });
    };

    createEventRule('SpotInterruptionRule', {
      source: ['aws.ec2'],
      detailType: ['EC2 Spot Instance Interruption Warning'],
    });

    createEventRule('RebalanceRule', {
      source: ['aws.ec2'],
      detailType: ['EC2 Instance Rebalance Recommendation'],
    });

    createEventRule('InstanceStateChangeRule', {
      source: ['aws.ec2'],
      detailType: ['EC2 Instance State-change Notification'],
    });

    this.installKarpenter(cluster, eksConfig.karpenter, eksConfig.clusterName);
  }

  private installKarpenter(cluster: eks.Cluster, config: any, clusterName: string) {
    new eks.HelmChart(this, 'KarpenterChart', {
      cluster,
      chart: 'karpenter',
      repository: 'oci://public.ecr.aws/karpenter/karpenter',
      namespace: 'kube-system',
      createNamespace: true,
      release: 'karpenter',
      version: config.version,
      values: {
        settings: {
          clusterName: clusterName,
          interruptionQueue: clusterName,
        },
        controller: {
          resources: {
            requests: {
              cpu: '1',
              memory: '1Gi',
            },
            limits: {
              cpu: '1',
              memory: '1Gi',
            },
          },
        },
      },
    });
  }
}