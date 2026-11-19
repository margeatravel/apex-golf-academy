/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your login link for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={brand}>Margea Golf Academy</Heading>
        <Heading style={h1}>Your login link</Heading>
        <Text style={text}>
          Click the button below to log in to {siteName}. This link will expire
          shortly.
        </Text>
        <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={btnTable}>
          <tbody>
            <tr>
              <td style={btnCell}>
                <a href={confirmationUrl} style={button}>Log In</a>
              </td>
            </tr>
          </tbody>
        </table>
        <Text style={fallbackText}>Or copy and paste this link into your browser:</Text>
        <Text style={fallbackUrl}>{confirmationUrl}</Text>
        <Text style={footer}>
          If you didn't request this link, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif', margin: 0, padding: '24px 0' }
const container = { padding: '24px 28px', maxWidth: '560px', margin: '0 auto', backgroundColor: '#ffffff' }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: '#4a7c59', letterSpacing: '0.08em', textTransform: 'uppercase' as const, margin: '0 0 16px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#1a1a1a',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const btnTable = { margin: '0 0 24px' }
const btnCell = { backgroundColor: '#4a7c59', borderRadius: '8px', padding: 0 }
const button = {
  display: 'inline-block',
  backgroundColor: '#4a7c59',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '14px 32px',
  textDecoration: 'none',
  border: '1px solid #4a7c59',
}
const fallbackText = { fontSize: '12px', color: '#55575d', margin: '0 0 6px' }
const fallbackUrl = { fontSize: '12px', color: '#4a7c59', wordBreak: 'break-all' as const, margin: '0 0 24px' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
