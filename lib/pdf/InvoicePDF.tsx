// React-PDF document for invoices.
//
// Rendered server-side via /api/projects/[projectId]/invoices/[invoiceId]/pdf.
// We deliberately use only built-in fonts (Helvetica family) so we don't
// need to ship font files at deploy time. Layout mirrors the on-screen
// print preview at app/dashboard/projects/[projectId]/invoices/[invoiceId]/print
// without trying to be pixel-perfect — PDF metrics differ from CSS.
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'
import { formatCents, formatDate } from '@/lib/format'

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
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 56,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1e2128',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 16,
    marginBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e3dd',
    borderBottomStyle: 'solid',
  },
  studioName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  logo: {
    height: 36,
    marginBottom: 8,
    objectFit: 'contain',
  },
  invoiceLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    textAlign: 'right',
  },
  invoiceNumber: {
    fontFamily: 'Helvetica',
    fontSize: 18,
    marginTop: 6,
    textAlign: 'right',
  },
  invoiceDate: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'right',
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 32,
  },
  metaCol: {
    flex: 1,
    paddingRight: 16,
  },
  metaLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: '#6b7280',
    marginBottom: 6,
  },
  metaValue: {
    fontSize: 12,
  },
  metaSub: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 2,
  },
  table: {
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e3dd',
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
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  totalsValue: {
    flex: 1.5,
    textAlign: 'right',
  },
  balanceLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  balanceValue: {
    fontSize: 16,
    textAlign: 'right',
  },
  notes: {
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e3dd',
    borderTopStyle: 'solid',
  },
  paidBanner: {
    marginTop: 32,
    fontSize: 10,
    color: '#6b7280',
    textAlign: 'center',
  },
})

export default function InvoicePDF({ data }: { data: InvoicePDFData }) {
  const { invoice, lines, designer, project, client, payments_total_cents } =
    data
  const brand = designer.brand_color ?? '#1e2128'
  const balance = Math.max(0, invoice.total_cents - payments_total_cents)
  const sortedLines = lines.slice().sort((a, b) => a.position - b.position)
  const studioLabel =
    designer.studio_name ?? designer.name ?? 'Studio'

  return (
    <Document title={`Invoice ${invoice.id.slice(0, 8).toUpperCase()}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={[styles.header, { borderBottomColor: brand + '55' }]}>
          <View>
            {designer.logo_url ? (
              <Image src={designer.logo_url} style={styles.logo} />
            ) : null}
            <Text style={[styles.studioName, { color: brand }]}>
              {studioLabel}
            </Text>
          </View>
          <View>
            <Text style={[styles.invoiceLabel, { color: brand }]}>
              Invoice
            </Text>
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
          <View style={[styles.tableHeader, { borderBottomColor: brand, color: brand }]}>
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

          <View style={[styles.totalsRow, { marginTop: 12 }]}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>
              {formatCents(invoice.total_cents)}
            </Text>
          </View>
          {payments_total_cents > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={[styles.totalsLabel, { color: '#6b7280' }]}>
                Payments received
              </Text>
              <Text style={[styles.totalsValue, { color: '#6b7280' }]}>
                −{formatCents(payments_total_cents)}
              </Text>
            </View>
          ) : null}
          <View style={[styles.totalsRow, { marginTop: 6 }]}>
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
            <Text style={{ fontSize: 10, lineHeight: 1.6 }}>
              {invoice.notes}
            </Text>
          </View>
        ) : null}

        {invoice.paid_at ? (
          <Text style={styles.paidBanner}>
            Paid {formatDate(invoice.paid_at)}. Thank you.
          </Text>
        ) : null}
      </Page>
    </Document>
  )
}
