export type UserRole = 'candidate' | 'hr'
export type EventType = 'open_day' | 'insight_scheme' | 'assessment_centre' | 'vacation_scheme' | 'interview' | 'other'
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'
export type ClaimStatus = 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'approved' | 'rejected' | 'payment_pending' | 'paid'
export type OcrStatus = 'pending' | 'processing' | 'succeeded' | 'failed'
export type PaymentMethod = 'manual_export' | 'stripe'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  created_at: string
}

export interface Firm {
  id: string
  name: string
  created_at: string
}

export interface FirmMember {
  id: string
  firm_id: string
  user_id: string
  is_admin: boolean
  created_at: string
}

export interface Event {
  id: string
  firm_id: string
  name: string
  event_type: EventType
  start_date: string | null
  end_date: string | null
  location: string | null
  reimbursement_cap: number | null
  currency: string
  is_open: boolean
  created_by: string
  created_at: string
}

export interface Invitation {
  id: string
  event_id: string
  email: string
  token: string
  status: InvitationStatus
  invited_by: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export interface EventParticipant {
  id: string
  event_id: string
  candidate_id: string
  invitation_id: string | null
  created_at: string
}

export interface Claim {
  id: string
  firm_id: string
  event_id: string
  candidate_id: string
  status: ClaimStatus
  amount_claimed: number | null
  currency: string
  description: string | null
  travel_date: string | null
  submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  review_note: string | null
  exported_at: string | null
  paid_at: string | null
  payment_reference: string | null
  payment_method: PaymentMethod | null
  stripe_payment_intent_id: string | null
  created_at: string
  updated_at: string
}

export interface Receipt {
  id: string
  claim_id: string
  storage_path: string
  file_name: string
  mime_type: string
  file_size_bytes: number
  ocr_status: OcrStatus
  extracted_merchant: string | null
  extracted_amount: number | null
  extracted_currency: string | null
  extracted_date: string | null
  extracted_provider: string | null
  extracted_journey: string | null
  extracted_reference: string | null
  extraction_confidence: 'high' | 'medium' | 'low' | null
  raw_extraction: Record<string, unknown> | null
  extraction_error: string | null
  created_at: string
}

export interface ClaimStatusHistory {
  id: string
  claim_id: string
  from_status: ClaimStatus | null
  to_status: ClaimStatus
  changed_by: string
  note: string | null
  created_at: string
}

// Joined/enriched types used in the UI
export interface ClaimWithDetails extends Claim {
  candidate?: Profile
  event?: Event & { firm?: Firm }
  receipts?: Receipt[]
  history?: ClaimStatusHistory[]
  reviewer?: Profile
}

export interface EventWithFirm extends Event {
  firm?: Firm
}

export interface InvitationWithEvent extends Invitation {
  event?: EventWithFirm
  invited_by_profile?: Profile
}
