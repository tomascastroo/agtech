import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { parseEnv } from '../config/env.schema.js';
import { typeOrmOptions } from './typeorm-options.js';

/** DataSource para la CLI de TypeORM (migraciones). */
export default new DataSource(typeOrmOptions(parseEnv(process.env)));
