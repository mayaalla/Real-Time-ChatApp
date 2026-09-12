import { config } from 'dotenv';


config({ path: '.env' });

const PORT: string = process.env.PORT as string | undefined || '4000';

export {PORT}