import { Injectable, OnModuleDestroy } from '@nestjs/common';
import sql from 'mssql';

@Injectable()
export class SqlServerClient implements OnModuleDestroy {
  private pool?: any;

  async getPool(): Promise<any> {
    if (this.pool) {
      return this.pool;
    }

    const config: any = {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_HOST ?? '127.0.0.1',
      database: process.env.DB_NAME ?? 'forvia_factory',
      port: Number(process.env.DB_PORT ?? 1433),
      options: {
        trustServerCertificate: true,
        enableArithAbort: true,
      },
      pool: {
        max: 20,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };

    this.pool = await new sql.ConnectionPool(config).connect();
    return this.pool;
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.close();
    }
  }
}
