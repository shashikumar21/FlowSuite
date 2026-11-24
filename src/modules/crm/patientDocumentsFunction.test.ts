import { describe, expect, it } from 'vitest'
import functionSource from '../../../supabase/functions/patient-documents/index.ts?raw'
import clientSource from './patientDocuments.ts?raw'

/**
 * Static contract only. The Deno runtime is not part of the Vite test suite,
 * so hosted verification must still confirm the deployed function and JWT mode.
 */
describe('patient-documents signer function contract', () => {
  it('requires an authenticated Supabase session', () => {
    expect(functionSource).toContain('verify_jwt=true')
    expect(functionSource).toContain("req.headers.get('authorization')")
    expect(functionSource).toContain('userClient.auth.getUser(token)')
    expect(functionSource).toContain("return errorResponse(401, 'unauthorized')")
  })

  it('rechecks tenant membership, clinical role and contact ownership', () => {
    expect(functionSource).toContain("admin.rpc('can_manage_patient_document_for_user'")
    expect(functionSource).toContain('p_tenant: body.tenant_id')
    expect(functionSource).toContain('p_contact: body.contact_id')
    expect(functionSource).toContain('p_user: userData.user.id')
    expect(functionSource).toContain("if (allowed !== true) return errorResponse(403, 'forbidden')")
  })

  it('keeps service-role credentials out of browser code', () => {
    expect(functionSource).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')")
    expect(clientSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(clientSource).not.toContain('service_role')
    expect(clientSource).toContain('.functions.invoke(FUNCTION_NAME')
  })

  it('validates object paths before signing uploads or deletes', () => {
    expect(functionSource).toContain('function isSafePath(')
    expect(functionSource).toContain("path.startsWith(prefix)")
    expect(functionSource).toContain("path.includes('..')")
    expect(functionSource).toContain("file.includes('/')")
    expect(functionSource).toContain('EXTENSIONS as readonly string[]')
    expect(functionSource).toContain("return errorResponse(400, 'invalid_path')")
  })

  it('audits only metadata and never sends patient data externally', () => {
    expect(functionSource).toContain("'patient_document.upload_signed'")
    expect(functionSource).toContain("'patient_document.viewed'")
    expect(functionSource).toContain("'patient_document.deleted'")
    expect(functionSource).toContain('p_content_type: contentType')
    expect(functionSource).not.toContain('p_original_name')
    expect(functionSource.toLowerCase()).not.toContain('whatsapp')
    expect(functionSource.toLowerCase()).not.toContain('send_email')
    expect(functionSource.toLowerCase()).not.toContain('google')
    expect(functionSource).not.toContain('fetch(')
  })
})
