#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { YamlReader } from '../lib/utils/yml-reader';
import { VpcConstruct } from '../lib/constructs/vpc-construct';

const app = new cdk.App();
const env = app.node.tryGetContext('env') || 'dev';
const config = YamlReader.readValue(env);

// Get the AWS account and region from the config
const awsAccount = config.aws_account;
const awsRegion = config.aws_region;

const constructMap: { [key: string]: new (scope: cdk.App, id: string, props: any) => cdk.Construct } = {
  vpc: VpcConstruct,
  // ...
};

const createdConstructs: { [key: string]: cdk.Construct } = {};

Object.keys(constructMap).forEach((key) => {
  const constructConfig = config.get(key)

  if (constructConfig) {
    const cdkName = `${env}-${key.charAt(0).toUpperCase() + key.slice(1)}`

    const stack = new cdk.Stack(app, `${cdkName}Stack`, {
      env: {
        account: awsAccount,
        region: awsRegion
      }
    });

    const ConstructClass = constructMap[key];
    createdConstructs[key] = new ConstructClass(stack, `${cdkName}Construct`, {
      config: constructConfig,
      env: env
    });
  }
});

app.synth();