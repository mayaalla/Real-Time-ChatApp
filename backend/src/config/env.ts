import { config } from 'dotenv';

config({ path: '.env' });

const PORT : string = process.env.PORT || '4000';
const DATABASE_URL : string = process.env.DATABASE_URL || '';
const DIRECT_URL : string = process.env.DIRECT_URL || '';
export {PORT, DATABASE_URL, DIRECT_URL};