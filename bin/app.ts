#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { YamlReader } from '../lib/utils/yml-reader';
import { VpcConstruct } from '../lib/constructs/vpc-construct';

const app = new cdk.App();
const env = app.node.tryGetContext('env') || 'dev';
const config = YamlReader.readValue(env);

// AWS config
const awsAccount = config.aws_account;
const awsRegion = config.aws_region;

type ConstructClass = new (scope: cdk.Stack, id: string, props: any) => cdk.Construct;
const constructMap: { [key: string]: ConstructClass } = {
  vpc: VpcConstruct,
  // ...
};

Object.entries(constructMap).forEach(([key, ConstructClass]) => {
  const constructConfig = config.get(key)

  if (!constructConfig) {
    console.log(`No configuration found for ${key}, skipping...`);
    return;
  }

  const cdkName = `${env}-${key.charAt(0).toUpperCase() + key.slice(1)}`

  //Create Stack
  const stack = new cdk.Stack(app, `${cdkName}Stack`, {
    env: {
      account: awsAccount,
      region: awsRegion
    }
  });

  //Create Construct
  new ConstructClass(stack, `${cdkName}Construct`, {
    config: constructConfig,
    env: env
  });
  
});

app.synth();
