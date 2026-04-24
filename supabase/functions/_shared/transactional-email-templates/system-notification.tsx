/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ObraMap'
const SITE_URL = 'https://obramap.app.br'

interface SystemNotificationProps {
  titulo?: string
  mensagem?: string
  tipo?: string
  obraNome?: string
  recipientName?: string
}

const SystemNotificationEmail = ({
  titulo,
  mensagem,
  tipo,
  obraNome,
  recipientName,
}: SystemNotificationProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{titulo || 'Você tem uma nova notificação no ObraMap'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>{SITE_NAME}</Heading>
        </Section>

        <Section style={content}>
          <Heading style={h1}>
            {recipientName ? `Olá, ${recipientName}` : 'Olá'}
          </Heading>
          <Text style={lead}>
            Você recebeu uma nova notificação{obraNome ? ` da obra ${obraNome}` : ''}.
          </Text>

          <Section style={card}>
            {tipo && <Text style={badge}>{tipo.toUpperCase()}</Text>}
            <Heading style={h2}>{titulo || 'Notificação'}</Heading>
            {mensagem && <Text style={text}>{mensagem}</Text>}
          </Section>

          <Section style={ctaWrap}>
            <Button style={button} href={SITE_URL}>
              Abrir no ObraMap
            </Button>
          </Section>

          <Text style={footer}>
            Este é um aviso automático do sistema {SITE_NAME}. Acesse o app para mais detalhes.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SystemNotificationEmail,
  subject: (data: Record<string, any>) =>
    `[${SITE_NAME}] ${data?.titulo || 'Nova notificação'}`,
  displayName: 'Notificação do sistema',
  previewData: {
    titulo: 'Medição PLE pendente de aprovação',
    mensagem: 'A medição #12 da obra Residencial Vila Nova aguarda sua aprovação.',
    tipo: 'medicao',
    obraNome: 'Residencial Vila Nova',
    recipientName: 'João',
  },
} satisfies TemplateEntry

// Styles — body background MUST be white
const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  margin: 0,
  padding: 0,
}

const container = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '24px 20px 40px',
}

const header = {
  borderBottom: '2px solid hsl(200, 98%, 39%)',
  paddingBottom: '12px',
  marginBottom: '24px',
}

const brand = {
  color: 'hsl(200, 98%, 39%)',
  fontSize: '20px',
  fontWeight: 700,
  margin: 0,
  letterSpacing: '-0.5px',
}

const content = {
  padding: 0,
}

const h1 = {
  color: 'hsl(222, 47%, 11%)',
  fontSize: '22px',
  fontWeight: 700,
  margin: '0 0 8px',
}

const lead = {
  color: '#55575d',
  fontSize: '14px',
  lineHeight: '1.55',
  margin: '0 0 20px',
}

const card = {
  backgroundColor: 'hsl(209, 40%, 96%)',
  borderLeft: '4px solid hsl(200, 98%, 39%)',
  borderRadius: '8px',
  padding: '18px 20px',
  margin: '0 0 24px',
}

const badge = {
  display: 'inline-block',
  backgroundColor: 'hsl(200, 98%, 39%)',
  color: '#ffffff',
  fontSize: '10px',
  fontWeight: 700,
  padding: '3px 10px',
  borderRadius: '999px',
  margin: '0 0 10px',
  letterSpacing: '0.5px',
}

const h2 = {
  color: 'hsl(222, 47%, 11%)',
  fontSize: '17px',
  fontWeight: 600,
  margin: '0 0 8px',
  lineHeight: '1.35',
}

const text = {
  color: '#3a3c42',
  fontSize: '14px',
  lineHeight: '1.55',
  margin: 0,
}

const ctaWrap = {
  textAlign: 'center' as const,
  margin: '8px 0 24px',
}

const button = {
  backgroundColor: 'hsl(200, 98%, 39%)',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  padding: '12px 28px',
  borderRadius: '8px',
  display: 'inline-block',
}

const footer = {
  color: '#999999',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '24px 0 0',
  textAlign: 'center' as const,
}
