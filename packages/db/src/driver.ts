import neo4j, { type Driver, type QueryResult, type Session } from "neo4j-driver";

export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Neo4jConfig {
  return {
    uri: env.NEO4J_URI ?? "bolt://localhost:7687",
    user: env.NEO4J_USER ?? "neo4j",
    password: env.NEO4J_PASSWORD ?? "stressforge",
  };
}

let driver: Driver | undefined;

export function getDriver(config: Neo4jConfig = configFromEnv()): Driver {
  if (!driver) {
    driver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password), {
      disableLosslessIntegers: true, // return plain JS numbers, not neo4j Integer
    });
  }
  return driver;
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = undefined;
  }
}

/** Wait for Neo4j to accept connections (used on startup). */
export async function verifyConnectivity(config: Neo4jConfig = configFromEnv()): Promise<void> {
  await getDriver(config).verifyConnectivity();
}

/** Run a read query and return the mapped rows. */
export async function read<T>(
  cypher: string,
  params: Record<string, unknown>,
  map: (record: QueryResult["records"][number]) => T,
): Promise<T[]> {
  const session = getDriver().session({ defaultAccessMode: neo4j.session.READ });
  try {
    const res = await session.run(cypher, params);
    return res.records.map(map);
  } finally {
    await session.close();
  }
}

/** Run a write query in an auto-commit transaction. */
export async function write<T = void>(
  cypher: string,
  params: Record<string, unknown>,
  map?: (result: QueryResult) => T,
): Promise<T> {
  const session = getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const res = await session.run(cypher, params);
    return (map ? map(res) : undefined) as T;
  } finally {
    await session.close();
  }
}

export type Transaction = {
  run(cypher: string, params?: Record<string, unknown>): Promise<QueryResult>;
};

/** Run several statements in one managed write transaction. */
export async function withWriteTx<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const session: Session = getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    return await session.executeWrite(async (tx) => fn(tx as unknown as Transaction));
  } finally {
    await session.close();
  }
}
