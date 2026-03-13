#!/usr/bin/env node
// SCRIPT PARA INVOCAR LAS LAMBDAS LOCALMENTE SIN DOCKER
// USO: npx ts-node scripts/invoke-local.ts scheduler
//      npx ts-node scripts/invoke-local.ts worker

import { execSync } from "child_process"

// VALIDAR ARGUMENTOS
const TARGET = process.argv[2]

if (!["scheduler", "worker"].includes(TARGET)) {
  console.error("USO: npx ts-node scripts/invoke-local.ts [scheduler|worker]")
  process.exit(1)
}

const handlerFile = TARGET === "scheduler" ? "src/main/schedulerLambda.ts" : "src/main/workerLambda.ts"

console.log(`INVOCANDO ${TARGET.toUpperCase()} LAMBDA LOCALMENTE...`)

try {
  execSync(`NODE_ENV=sandbox npx ts-node --transpile-only ${handlerFile}`, {
    stdio: "inherit",
    cwd: process.cwd(),
  })
} catch (err) {
  console.error(`ERROR AL INVOCAR ${TARGET}:`, (err as Error).message)
  process.exit(1)
}
