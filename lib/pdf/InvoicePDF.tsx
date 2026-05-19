// React-PDF document for invoices.
//
// Rendered server-side via /api/projects/[projectId]/invoices/[invoiceId]/pdf.
// Typography mirrors the on-screen brand: Inter for UI labels, EB Garamond
// for descriptions, DM Serif Text for the document number. Fonts are
// registered lazily via ensureFontsRegistered().
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'
import { formatCents, formatDate } from '@/lib/format'
import { ensureFontsRegistered, PDF_COLORS } from './fonts'

ensureFontsRegistered()

export interface InvoicePDFData {
  invoice: {
    id: string
    type: string
    status: string
    total_cents: number
    sent_at: string | null
    paid_at: string | null
    notes: string | null
    created_at: string
  }
  lines: Array<{
    id: string
    description: string
    quantity: number
    unit_price_cents: number
    total_price_cents: number
    position: number
  }>
  payments_total_cents: number
  project: { name: string; location: string | null }
  client: { name: string; email: string | null } | null
  designer: {
    studio_name: string | null
    name: string | null
    logo_url: string | null
    brand_color: string | null
  }
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 64,
    fontFamily: 'EB Garamond',
    fontSize: 10.5,
    color: PDF_COLORS.ink,
    backgroundColor: PDF_COLORS.cream,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 18,
    marginBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.line,
    borderBottomStyle: 'solid',
  },
  studioName: {
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  logo: {
    height: 36,
    marginBottom: 10,
    objectFit: 'contain',
  },
  invoiceLabel: {
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 8,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    textAlign: 'right',
    color: PDF_COLORS.inkMuted,
  },
  invoiceNumber: {
    fontFamily: 'DM Serif Text',
    fontSize: 22,
    marginTop: 8,
    textAlign: 'right',
  },
  invoiceDate: {
    fontFamily: 'Inter',
    fontSize: 9.5,
    color: PDF_COLORS.inkSubtle,
    marginTop: 4,
    textAlign: 'right',
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 36,
  },
  metaCol: {
    flex: 1,
    paddingRight: 16,
  },
  metaLabel: {
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 8,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: PDF_COLORS.inkSubtle,
    marginBottom: 6,
  },
  metaValue: {
    fontFamily: 'EB Garamond',
    fontSize: 13,
  },
  metaSub: {
    fontFamily: 'EB Garamond',
    fontSize: 10.5,
    color: PDF_COLORS.inkMuted,
    marginTop: 2,
  },
  table: {
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.ink,
    borderBottomStyle: 'solid',
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF_COLORS.line,
    borderBottomStyle: 'solid',
  },
  colDesc: { flex: 4, paddingRight: 8 },
  colQty: { flex: 0.8, textAlign: 'right' },
  colUnit: { flex: 1.5, textAlign: 'right' },
  colTotal: { flex: 1.5, textAlign: 'right' },
  totalsRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  totalsLabel: {
    flex: 7.3,
    textAlign: 'right',
    paddingRight: 8,
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  totalsValue: {
    flex: 1.5,
    textAlign: 'right',
  },
  balanceLabel: {
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  balanceValue: {
    fontFamily: 'DM Serif Text',
    fontSize: 18,
    textAlign: 'right',
  },
  notes: {
    marginTop: 36,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.line,
    borderTopStyle: 'solid',
  },
  paidBanner: {
    marginTop: 36,
    fontFamily: 'Inter',
    fontSize: 9.5,
    color: PDF_COLORS.inkMuted,
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: 'DM Serif Text',
    fontSize: 9,
    color: PDF_COLORS.inkSubtle,
  },
})

export default function InvoicePDF({ data }: { data: InvoicePDFData }) {
  const { invoice, lines, designer, project, client, payments_total_cents } =
    data
  const brand = designer.brand_color ?? PDF_COLORS.accent
  const balance = Math.max(0, invoice.total_cents - payments_total_cents)
  const sortedLines = lines.slice().sort((a, b) => a.position - b.position)
  const studioLabel =
    designer.studio_name ?? designer.name ?? 'Studio'

  return (
    <Document title={`Invoice ${invoice.id.slice(0, 8).toUpperCase()}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            {designer.logo_url ? (
              <Image src={designer.logo_url} style={styles.logo} />
            ) : null}
            <Text style={[styles.studioName, { color: brand }]}>
              {studioLabel}
            </Text>
          </View>
          <View>
            <Text style={styles.invoiceLabel}>Invoice</Text>
            <Text style={styles.invoiceNumber}>
              #{invoice.id.slice(0, 8).toUpperCase()}
            </Text>
            <Text style={styles.invoiceDate}>
              {formatDate(invoice.sent_at ?? invoice.created_at)}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Bill to</Text>
            <Text style={styles.metaValue}>{client?.name ?? '—'}</Text>
            {client?.email ? (
              <Text style={styles.metaSub}>{client.email}</Text>
            ) : null}
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Project</Text>
            <Text style={styles.metaValue}>{project.name}</Text>
            {project.location ? (
              <Text style={styles.metaSub}>{project.location}</Text>
            ) : null}
            <Text style={styles.metaSub}>
              {invoice.type} · {invoice.status.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colUnit}>Unit</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {sortedLines.map((l) => (
            <View key={l.id} style={styles.tableRow}>
              <Text style={styles.colDesc}>{l.description}</Text>
              <Text style={styles.colQty}>{l.quantity}</Text>
              <Text style={styles.colUnit}>
                {formatCents(l.unit_price_cents)}
              </Text>
              <Text style={styles.colTotal}>
                {formatCents(l.total_price_cents)}
              </Text>
            </View>
          ))}

          <View style={[styles.totalsRow, { marginTop: 14 }]}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>
              {formatCents(invoice.total_cents)}
            </Text>
          </View>
          {payments_total_cents > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={[styles.totalsLabel, { color: PDF_COLORS.inkMuted }]}>
                Payments received
              </Text>
              <Text style={[styles.totalsValue, { color: PDF_COLORS.inkMuted }]}>
                −{formatCents(payments_total_cents)}
              </Text>
            </View>
          ) : null}
          <View style={[styles.totalsRow, { marginTop: 8 }]}>
            <Text
              style={[
                styles.totalsLabel,
                styles.balanceLabel,
                { color: brand },
              ]}
            >
              {balance === 0 ? 'Paid in full' : 'Balance due'}
            </Text>
            <Text
              style={[
                styles.totalsValue,
                styles.balanceValue,
                { color: brand },
              ]}
            >
              {formatCents(balance)}
            </Text>
          </View>
        </View>

        {invoice.notes ? (
          <View style={styles.notes}>
            <Text style={styles.metaLabel}>Notes</Text>
            <Text style={{ fontSize: 10.5, lineHeight: 1.65 }}>
              {invoice.notes}
            </Text>
          </View>
        ) : null}

        {invoice.paid_at ? (
          <Text style={styles.paidBanner}>
            PAID · {formatDate(invoice.paid_at)} · Thank you.
          </Text>
        ) : null}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}
