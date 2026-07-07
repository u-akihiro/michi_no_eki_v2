import { Hono } from 'hono'
import type { Env } from './env'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.text('Hello from api'))

app.notFound((c) => c.json({ error: 'not found' }, 404))

export default app
