#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AdminrolesStack } from '../lib/adminroles-stack';

const app = new cdk.App();
new AdminrolesStack(app, 'AdminrolesStack', {
 });