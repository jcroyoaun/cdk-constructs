#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { VpcConstruct } from '../lib/constructs/vpc-construct';
import { EksConstruct } from '../lib/constructs/eks-construct'
import { RdsConstruct } from '../lib/constructs/rds-construct'
import { NlbConstruct } from '../lib/constructs/nlb-construct'
import { YamlReader } from '../lib/utils/yaml-reader';
import { Construct } from 'constructs';

const app = new cdk.App();

/**
 * Retrieve the environment name from command-line arguments
 * Usage: cdk deploy -c env=<environment>
 */
const env = app.node.tryGetContext('env');

if (!env) {
  throw new Error('Environment not specified. Use -c env=<environment>');
}

// Load the environment-specific configuration from config/<env>.yaml
const config = YamlReader.readValue(env);

// Set up AWS environment for CDK bootstrapping and deployment
const awsEnv = { 
  account: config.aws_account, 
  region: config.aws_region
};

/**
 * Dynamic infrastructure creation based on configuration.
 * Constructs are instantiated within individual stacks.
 * Allows easy addition of new components via config and constructMap.
 */

type ConstructClass = new (scope: cdk.Stack, id: string, props: any) => Construct
const constructMap: { [key: string]: ConstructClass } = {
  vpc: VpcConstruct,
  eks: EksConstruct,
  rds: RdsConstruct,
  nlb: NlbConstruct,
};

const createdConstructs: { [key: string]: Construct } = {};

Object.entries(constructMap).forEach(([key, ConstructClass]) => {
  const constructConfig = config[key]
  
  if (!constructConfig) {
    console.log(`No configuration found for ${key}, skipping...`);
    return;
  }

  const resourceAcronym = `${env}-${key.charAt(0).toUpperCase() + key.slice(1)}`
  console.log(`Creating stack: ${resourceAcronym}Stack`);

  //Create Stack
  const stack = new cdk.Stack(app, `${resourceAcronym}Stack`, {
    env: awsEnv
  });

  console.log(`Creating construct: ${key}`);

  
  //Create Construct
  const construct = new ConstructClass(stack, key, {
    config: constructConfig,
    env: env,
    constructRefs: createdConstructs,
    awsEnv: awsEnv
  });


  //Saving construct for cross-stack referencing
  createdConstructs[key] = construct;
});

app.synth();
