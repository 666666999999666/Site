import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { Client } from "pg"
import { requireInboxTestDatabaseUrl } from "./inbox-test-database"

async function main() {
process.env.TZ = "UTC"
// Called only by the isolated-cluster wrapper; this database must be empty.
const url = requireInboxTestDatabaseUrl(process.env.DATABASE_URL)
const client = new Client({ connectionString: url })
const migration = "20261028150000_private_material_workflow"
await client.connect()
try {
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")
  assert.equal(tables.rowCount, 0, "Refusing to alter a nonempty database")
  const root = path.join(process.cwd(), "prisma/migrations")
  const folders = (await readdir(root, {withFileTypes:true})).filter((item)=>item.isDirectory()).map((item)=>item.name).sort()
  for (const folder of folders.filter((name)=>name < migration))
    await client.query(await readFile(path.join(root,folder,"migration.sql"),"utf8"))
  await client.query(`INSERT INTO "User" (id,username,"passwordHash",name,email,"updatedAt") VALUES ('legacy-owner','legacy-owner','test-only','Test','legacy@example.test',NOW())`)
  const raw = "\uFEFF idea：  原始中文😀\r\n第二行  "
  const hash = createHash("sha256").update(raw).digest("hex")
  const captured = "2026-01-02T03:04:05.000Z"
  await client.query(`INSERT INTO "InboxItem" (id,"ownerId",kind,"rawInput","rawSha256","parsedBody","parserVersion","requestKey","createdAt","updatedAt") VALUES ('old-inbox','legacy-owner','IDEA',$1,$2,'parsed',1,'old-key',$3,$3)`,[raw,hash,captured])
  await client.query(`INSERT INTO "Idea" (id,"ownerId",title,content,"sourceInboxItemId","createdAt","updatedAt") VALUES ('old-captured','legacy-owner','edited title','edited interpretation','old-inbox',$1,$1),('old-manual','legacy-owner','manual','  manual snapshot\r\n  ',NULL,$1,$1)`,[captured])
  await client.query(`INSERT INTO "Todo" (id,title,status,"updatedAt") VALUES ('old-todo','keep task','TODO',NOW())`)
  await client.query(`INSERT INTO "Post" (id,title,content,slug,tags,status,"updatedAt") VALUES ('old-public','keep public','public body','legacy-public',ARRAY['keep'],'PUBLISHED',NOW())`)
  await client.query(`INSERT INTO "Setting" (id,key,value) VALUES ('old-skill','about_skills','TypeScript,React,Next.js,Node.js,Docker,Git,Python,Rust'),('authored-intro','about_intro','作者自写介绍，必须保留')`)
  await client.query(`INSERT INTO "IdeaConversion" (id,"ownerId","ideaId","targetType","requestKey","todoId") VALUES ('legacy-conversion','legacy-owner','old-manual','TODO','legacy-conversion-key','old-todo')`)
  const beforePost = (await client.query('SELECT * FROM "Post" WHERE id=\'old-public\'')).rows[0]
  await client.query(await readFile(path.join(root,migration,"migration.sql"),"utf8"))
  const rows = (await client.query('SELECT * FROM "Idea" ORDER BY id')).rows
  assert.equal(rows[0].rawInput,raw)
  assert.equal(rows[0].content,"edited interpretation")
  assert.equal(rows[0].source,"inbox")
  assert.equal(rows[0].capturedAt.toISOString(),captured)
  assert.equal(rows[1].rawInput,"  manual snapshot\r\n  ")
  assert.equal(rows[1].source,"legacy")
  assert.equal(rows[1].capturedAt.toISOString(),captured)
  assert.ok(rows.every((row)=>row.discussionStatus === "STORED" && row.discussionSummary === null))
  assert.deepEqual((await client.query('SELECT * FROM "Post" WHERE id=\'old-public\'')).rows[0],beforePost)
  assert.equal((await client.query('SELECT status FROM "Todo" WHERE id=\'old-todo\'')).rows[0].status,"TODO")
  assert.equal((await client.query('SELECT value FROM "Setting" WHERE key=\'about_intro\'')).rows[0].value,"作者自写介绍，必须保留")
  assert.equal((await client.query('SELECT value FROM "Setting" WHERE key=\'about_skills\'')).rows[0].value,"Python,Agent 应用")
  for (const assignment of ['"rawInput"=\'changed\'', 'source=\'changed\'', '"capturedAt"=NOW()'])
    await assert.rejects(()=>client.query(`UPDATE "Idea" SET ${assignment} WHERE id='old-captured'`),/immutable/)
  await client.query(`UPDATE "Idea" SET content='new interpretation',"discussionStatus"='DISCUSSED',"discussionSummary"='summary' WHERE id='old-captured'`)
  assert.equal((await client.query('SELECT "rawInput" FROM "Idea" WHERE id=\'old-captured\'')).rows[0].rawInput,raw)
  const { prisma, disconnectDatabase } = await import("../lib/db")
  try {
    const { convertIdea } = await import("../lib/ideas")
    const { ideaConversionSchema } = await import("../lib/ideas-validation")
    const input = ideaConversionSchema.parse({targetType:"TODO",requestKey:"legacy-conversion-key",title:"keep task"})
    const replay = await convertIdea("legacy-owner", "old-manual", input)
    assert.equal(replay.targetId,"old-todo")
    assert.equal(await prisma.ideaConversion.count(),1)
    assert.equal((await prisma.ideaConversion.findUniqueOrThrow({where:{id:"legacy-conversion"}})).inputDigest,null)
    assert.equal(await prisma.todo.count(),1)
  } finally { await disconnectDatabase() }
  console.log("Material historical upgrade and immutable provenance checks passed")
} finally { await client.end() }

}
main().catch((error) => { console.error(error); process.exitCode = 1 })
