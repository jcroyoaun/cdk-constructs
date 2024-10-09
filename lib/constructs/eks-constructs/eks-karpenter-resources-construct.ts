import { Construct } from 'constructs';
import * as cdk8s from 'cdk8s';
import * as yaml from 'js-yaml';

export interface KarpenterResourcesProps {
  clusterName: string;
  nodeRoleName: string;
}

export class KarpenterResourcesConstruct extends Construct {
  constructor(scope: Construct, id: string, props: KarpenterResourcesProps) {
    super(scope, id);

    const chart = new cdk8s.Chart(this, 'KarpenterResourcesChart');

    const yamlContent = `
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: default
spec:
  disruption:
    budgets:
    - nodes: 10%
    consolidationPolicy: WhenEmptyOrUnderutilized
    expireAfter: 720h
  limits:
    cpu: 60
    memory: 160Gi
  template:
    spec:
      nodeClassRef:
        apiVersion: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default
      requirements:
      - key: kubernetes.io/arch
        operator: In
        values:
        - amd64
      - key: kubernetes.io/os
        operator: In
        values:
        - linux
      - key: karpenter.sh/capacity-type
        operator: In
        values:
        - spot
      - key: karpenter.k8s.aws/instance-category
        operator: In
        values:
        - c
        - m
        - r
      - key: karpenter.k8s.aws/instance-generation
        operator: Gt
        values:
        - "2"
      - key: karpenter.k8s.aws/instance-size
        operator: In
        values:
        - small
        - medium
        - large
        - xlarge
        - 2xlarge
---
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiFamily: AL2
  metadataOptions:
    httpEndpoint: enabled
    httpProtocolIPv6: disabled
    httpPutResponseHopLimit: 2
    httpTokens: required
  role: ${props.nodeRoleName}
  securityGroupSelectorTerms:
  - tags:
      karpenter.sh/discovery: ${props.clusterName}
  subnetSelectorTerms:
  - tags:
      karpenter.sh/discovery: ${props.clusterName}
`;

    // Parse the YAML content
    const docs = yaml.loadAll(yamlContent);

    // Create an ApiObject for each YAML document
    docs.forEach((doc, index) => {
      new cdk8s.ApiObject(chart, `KarpenterResource-${index}`, doc as any);
    });
  }
}