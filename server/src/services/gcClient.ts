import gocardless, { Environments } from 'gocardless-nodejs';
import { env } from '../config/env';

export const gcClient = gocardless(env.gcAccessToken, Environments.Sandbox);
