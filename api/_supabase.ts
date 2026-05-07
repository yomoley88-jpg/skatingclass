import { createClient } from '@supabase/supabase-js'

export const PROOF_BUCKET = 'attendance-proof'

const url = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export function getSupabaseAdmin() {
  if (!url || !serviceRoleKey) {
    throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

export function json(status: number, body: unknown) {
  return Response.json(body, { status })
}

export function proofPaths(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function fileExtension(file: File) {
  return file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
}

export function safeFileName(file: File, fallback: string) {
  const stem = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || fallback.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  return `${stem}-${crypto.randomUUID()}.${fileExtension(file)}`
}

export async function uploadProof(file: File, path: string) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image file.`)

  const { error } = await getSupabaseAdmin().storage
    .from(PROOF_BUCKET)
    .upload(path, file, {
      contentType: file.type || undefined,
      cacheControl: '3600',
      upsert: false,
    })

  if (error) throw new Error(`Proof photo upload failed: ${error.message}`)
  return path
}
