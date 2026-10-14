import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { IdChip, VersionChip } from '@/components/chips'
import { SeverityBadge, StatusPill } from '@/components/status-pill'
import { UpgradeCard } from '@/components/upgrade-card'

describe('StatusPill', () => {
  it('shows a label, not colour alone', () => {
    render(<StatusPill status="in_review" />)
    expect(screen.getByText('In review')).toBeInTheDocument()
  })
  it('strikes through retired', () => {
    render(<StatusPill status="retired" />)
    expect(screen.getByText('Retired')).toHaveClass('line-through')
  })
  it('falls back to a readable label for unknown statuses', () => {
    render(<StatusPill status="needs_input" />)
    expect(screen.getByText('Needs input')).toBeInTheDocument()
  })
})

describe('chips and badges', () => {
  it('renders ID and version chips', () => {
    render(
      <>
        <IdChip>ITD-006</IdChip>
        <VersionChip version={4} />
        <SeverityBadge severity="critical" />
      </>,
    )
    expect(screen.getByText('ITD-006')).toBeInTheDocument()
    expect(screen.getByLabelText('Version 4')).toHaveTextContent('v4')
    expect(screen.getByText('Critical')).toBeInTheDocument()
  })
})

describe('UpgradeCard', () => {
  it('names the plan and offers contact', async () => {
    render(<UpgradeCard feature="security" />)
    expect(screen.getByRole('heading', { name: 'Security registers' })).toBeInTheDocument()
    expect(screen.getByText('Included in the Pro plan.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Contact us to upgrade' }))
    expect(screen.getByRole('status')).toHaveTextContent('sales@3rdloop.ph')
  })
})

describe('ConfirmDialog', () => {
  it('requires typed confirmation for destructive actions', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        onOpenChange={() => undefined}
        title="Delete key"
        description="This can't be undone."
        confirmLabel="Delete key"
        destructive
        typedConfirmation="openai-prod"
        onConfirm={onConfirm}
      />,
    )
    const confirm = screen.getByRole('button', { name: 'Delete key' })
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Type “openai-prod”/), 'openai-prod')
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
