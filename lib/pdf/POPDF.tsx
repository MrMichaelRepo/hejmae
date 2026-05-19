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
import { ensureFontsRegistered, PDF_COLORS } from './fonts'

ensureFontsRegistered()

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
  poLabel: {
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 8,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    textAlign: 'right',
    color: PDF_COLORS.inkMuted,
  },
  poNumber: {
    fontFamily: 'DM Serif Text',
    fontSize: 22,
    marginTop: 8,
    textAlign: 'right',
  },
  poDate: {
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
    paddingTop: 16,
  },
  totalsLabel: {
    flex: 7.3,
    textAlign: 'right',
    paddingRight: 8,
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  totalsValue: {
    flex: 1.5,
    textAlign: 'right',
    fontFamily: 'DM Serif Text',
    fontSize: 18,
  },
  notes: {
    marginTop: 36,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.line,
    borderTopStyle: 'solid',
  },
  footer: {
    marginTop: 48,
    fontFamily: 'Inter',
    fontSize: 9,
    color: PDF_COLORS.inkSubtle,
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

export default function POPDF({ data }: { data: POPDFData }) {
  const { po, lines, designer, project } = data
  const brand = designer.brand_color ?? PDF_COLORS.accent
  const sortedLines = lines.slice().sort((a, b) => a.position - b.position)
  const total = sortedLines.reduce(
    (a, l) => a + l.total_trade_price_cents,
    0,
  )
  const studioLabel = designer.studio_name ?? designer.name ?? 'Studio'

  return (
    <Document title={`PO ${po.id.slice(0, 8).toUpperCase()}`}>
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
            <Text style={styles.poLabel}>Purchase Order</Text>
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
                {formatCents(l.trade_price_cents)}
              </Text>
              <Text style={styles.colTotal}>
                {formatCents(l.total_trade_price_cents)}
              </Text>
            </View>
          ))}

          <View style={styles.totalsRow}>
            <Text style={[styles.totalsLabel, { color: brand }]}>Total</Text>
            <Text style={[styles.totalsValue, { color: brand }]}>
              {formatCents(total)}
            </Text>
          </View>
        </View>

        {po.notes ? (
          <View style={styles.notes}>
            <Text style={styles.metaLabel}>Notes</Text>
            <Text style={{ fontSize: 10.5, lineHeight: 1.65 }}>{po.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Please confirm receipt and expected ship date by reply.
        </Text>

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
