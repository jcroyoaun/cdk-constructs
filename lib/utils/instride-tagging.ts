import * as cdk from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

const POD_NAME = 'Moscow';
const MANAGED_BY = 'AWS CDK';

export class InstrideTagger {
  public static tagResource(resource: IConstruct, resourceName: string, props: any): void {
    const tags = [
      { key: 'Name', value: resourceName },
      { key: 'Environment', value: props.env },
      { key: 'Managed By', value: MANAGED_BY },
      { key: 'Pod Name', value: POD_NAME },
    ];

    tags.forEach(tag => {
      cdk.Tags.of(resource).add(tag.key, tag.value);
    });
  }

  public static tagResources(resources: IConstruct[], resourceName: string, props: any): void {
    resources.forEach(resource => this.tagResource(resource, resourceName, props));
  }
}