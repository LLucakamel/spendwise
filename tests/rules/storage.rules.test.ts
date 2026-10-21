/**
 * Cloud Storage security rules tests (invoice files). They run against the Storage emulator:
 *   npm run test:rules
 */
import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const BUCKET = 'gs://demo-spendwise.appspot.com'
const HASH = 'ab'.repeat(32)
const MB = 1024 * 1024

let env: RulesTestEnvironment

type Ctx = ReturnType<RulesTestEnvironment['authenticatedContext']>

const alice = () => env.authenticatedContext('alice').storage(BUCKET)
const bob = () => env.authenticatedContext('bob').storage(BUCKET)
const anon = () => env.unauthenticatedContext().storage(BUCKET)

const bytes = (size = 64) => new Uint8Array(size).fill(7)
const path = (uid = 'alice', fileName = `${HASH}.jpg`, invoiceId = 'inv1') => `users/${uid}/invoices/${invoiceId}/${fileName}`

/** Upload tasks are thenables; wrap them so the assert helpers get a real promise. */
function upload(storage: ReturnType<Ctx['storage']>, filePath: string, data: Uint8Array = bytes(), contentType = 'image/jpeg') {
  return Promise.resolve(storage.ref(filePath).put(data, { contentType }))
}

async function seed(filePath: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await upload(ctx.storage(BUCKET), filePath)
  })
}

beforeAll(async () => {
  const [host, port] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199').replace(/^https?:\/\//, '').split(':')
  env = await initializeTestEnvironment({
    projectId: 'demo-spendwise',
    storage: { rules: readFileSync('storage.rules', 'utf8'), host, port: Number(port) },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearStorage()
})

describe('invoice files: owner access', () => {
  it('lets the owner upload a valid JPEG and read and delete it', async () => {
    await assertSucceeds(upload(alice(), path()))
    await assertSucceeds(alice().ref(path()).getMetadata())
    await assertSucceeds(alice().ref(path()).delete())
  })

  it.each([
    ['png', 'image/png'],
    ['webp', 'image/webp'],
    ['pdf', 'application/pdf'],
    ['json', 'application/json'],
    ['xml', 'application/xml'],
  ])('accepts a .%s file with type %s', async (ext, type) => {
    await assertSucceeds(upload(alice(), path('alice', `${HASH}.${ext}`), bytes(), type))
  })

  it('accepts a file of exactly 10 MB', async () => {
    await assertSucceeds(upload(alice(), path(), bytes(10 * MB)))
  })

  // Overwriting the owner's own file is an `update` in production (denied: only `create` is
  // allowed), but the Storage emulator evaluates every upload as `create`, so it can't be asserted here.
  it('does not let another user overwrite an existing file', async () => {
    await assertSucceeds(upload(alice(), path()))
    await assertFails(upload(bob(), path()))
  })

  it('lets the owner list their own folders (names only) so all files can be deleted', async () => {
    await seed(path())
    await assertSucceeds(alice().ref('users/alice').listAll())
    await assertSucceeds(alice().ref('users/alice/invoices/inv1').listAll())
    await assertFails(bob().ref('users/alice').listAll())
    await assertFails(anon().ref('users/alice').listAll())
    await assertFails(alice().ref('users').listAll())
    await assertFails(alice().ref('').listAll())
  })
})

describe('invoice files: isolation', () => {
  it('denies another signed-in user reading, listing, deleting or uploading', async () => {
    await seed(path())
    await assertFails(bob().ref(path()).getMetadata())
    await assertFails(bob().ref(path()).getDownloadURL())
    await assertFails(bob().ref('users/alice/invoices/inv1').listAll())
    await assertFails(bob().ref(path()).delete())
    await assertFails(upload(bob(), path('alice', `${'cd'.repeat(32)}.jpg`)))
  })

  it('denies unauthenticated access', async () => {
    await seed(path())
    await assertFails(anon().ref(path()).getMetadata())
    await assertFails(anon().ref(path()).getDownloadURL())
    await assertFails(anon().ref(path()).delete())
    await assertFails(upload(anon(), path('alice', `${'cd'.repeat(32)}.jpg`)))
  })
})

describe('invoice files: upload validation', () => {
  it.each([
    ['a human-readable name', 'receipt.jpg'],
    ['an uppercase hash', `${HASH.toUpperCase()}.jpg`],
    ['a short hash', `${'ab'.repeat(31)}.jpg`],
    ['no extension', HASH],
    ['a long extension', `${HASH}.jpegxl`],
    ['a double extension', `${HASH}.jpg.html`],
  ])('rejects %s as the file name', async (_label, fileName) => {
    await assertFails(upload(alice(), path('alice', fileName)))
  })

  it('rejects a file larger than 10 MB', async () => {
    await assertFails(upload(alice(), path(), bytes(10 * MB + 1)))
  })

  it.each([['text/html'], ['image/svg+xml'], ['application/octet-stream'], ['application/javascript']])(
    'rejects content type %s',
    async (type) => {
      await assertFails(upload(alice(), path(), bytes(), type))
    },
  )

  it('rejects an invalid invoice ID segment', async () => {
    await assertFails(upload(alice(), path('alice', `${HASH}.jpg`, 'inv 1')))
  })
})

describe('paths outside users/{uid}/invoices', () => {
  it.each([
    ['the user root', `users/alice/${HASH}.jpg`],
    ['another folder of the user', `users/alice/avatars/inv1/${HASH}.jpg`],
    ['a deeper invoice path', `users/alice/invoices/inv1/sub/${HASH}.jpg`],
    ['directly in the invoice collection', `users/alice/invoices/${HASH}.jpg`],
    ['a public folder', `public/${HASH}.jpg`],
    ['the bucket root', `${HASH}.jpg`],
  ])('denies uploads to %s', async (_label, filePath) => {
    await assertFails(upload(alice(), filePath))
  })

  it('denies reading files outside the invoice folder, even the user’s own', async () => {
    await seed(`users/alice/avatars/inv1/${HASH}.jpg`)
    await assertFails(alice().ref(`users/alice/avatars/inv1/${HASH}.jpg`).getMetadata())
  })
})
