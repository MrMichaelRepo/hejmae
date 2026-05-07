// React-PDF document for purchase orders. Mirrors lib/pdf/InvoicePDF.tsx
// in shape so the styling stays consistent across studio paperwork.
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'
import { formatCents, formatDate } from '@/lib/format'

export interface POPDFData {
  po: {
    id: string
    vendor_name: string
    vendor_email: string | null
    expected_lead_time_days: number | null
    status: string
    sent_at: string | null
    notes: string | null
    created_at: string
  }
  lines: Array<{
    id: string
    description: string
    quantity: number
    trade_price_cents: number
    total_trade_price_cents: number
    position: number
  }>
  project: { name: string; location: string | null }
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
  poLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    textAlign: 'right',
  },
  poNumber: {
    fontFamily: 'Helvetica',
    fontSize: 18,
    marginTop: 6,
    textAlign: 'right',
  },
  poDate: {
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
    paddingTop: 14,
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
    fontSize: 16,
  },
  notes: {
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e3dd',
    borderTopStyle: 'solid',
  },
  footer: {
    marginTop: 48,
    fontSize: 9,
    color: '#6b7280',
    textAlign: 'center',
  },
})

export default function POPDF({ data }: { data: POPDFData }) {
  const { po, lines, designer, project } = data
  const brand = designer.brand_color ?? '#1e2128'
  const sortedLines = lines.slice().sort((a, b) => a.position - b.position)
  const total = sortedLines.reduce(
    (a, l) => a + l.total_trade_price_cents,
    0,
  )
  const studioLabel = designer.studio_name ?? designer.name ?? 'Studio'

  return (
    <Document title={`PO ${po.id.slice(0, 8).toUpperCase()}`}>
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
            <Text style={[styles.poLabel, { color: brand }]}>
              Purchase Order
            </Text>
            <Text style={styles.poNumber}>
              #{po.id.slice(0, 8).toUpperCase()}
            </Text>
            <Text style={styles.poDate}>
              {formatDate(po.sent_at ?? po.created_at)}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Vendor</Text>
            <Text style={styles.metaValue}>{po.vendor_name}</Text>
            {po.vendor_email ? (
              <Text style={styles.metaSub}>{po.vendor_email}</Text>
            ) : null}
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Project</Text>
            <Text style={styles.metaValue}>{project.name}</Text>
            {project.location ? (
              <Text style={styles.metaSub}>{project.location}</Text>
            ) : null}
            {po.expected_lead_time_days ? (
              <Text style={styles.metaSub}>
                Lead time: {po.expected_lead_time_days} days
              </Text>
            ) : null}
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
                {formatCents(l.trade_price_cents)}
              </Text>
              <Text style={styles.colTotal}>
                {formatCents(l.total_trade_price_cents)}
              </Text>
            </View>
          ))}

          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total</Text>
            <Text style={styles.totalsValue}>{formatCents(total)}</Text>
          </View>
        </View>

        {po.notes ? (
          <View style={styles.notes}>
            <Text style={styles.metaLabel}>Notes</Text>
            <Text style={{ fontSize: 10, lineHeight: 1.6 }}>{po.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Please confirm receipt and expected ship date by reply.
        </Text>
      </Page>
    </Document>
  )
}
