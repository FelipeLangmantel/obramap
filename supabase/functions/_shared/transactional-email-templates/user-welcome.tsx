/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ObraMap'
const DEFAULT_APP_URL = 'https://obramap.app.br'

interface UserWelcomeProps {
  userName?: string
  companyName?: string | null
  loginEmail: string
  temporaryPassword?: string
  appUrl?: string
  logoUrl?: string
}

const UserWelcomeEmail = ({
  userName,
  companyName,
  loginEmail,
  temporaryPassword,
  appUrl,
  logoUrl,
}: UserWelcomeProps) => {
  const accessUrl = appUrl || DEFAULT_APP_URL
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Seu acesso ao ObraMap foi criado</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            {logoUrl ? (
              <Img src={logoUrl} alt={SITE_NAME} width="150" style={logo} />
            ) : (
              <Heading style={brand}>{SITE_NAME}</Heading>
            )}
          </Section>

          <Section style={content}>
            <Heading style={h1}>Bem-vindo ao ObraMap</Heading>
            <Text style={lead}>
              Ola, {userName || loginEmail}! Seu acesso ao ObraMap foi criado com sucesso.
            </Text>
            <Text style={text}>
              O ObraMap e a plataforma de gestao visual de obras que centraliza Diario de Obra,
              Producao, Mapa de Obras, relatorios, registros fotograficos e acompanhamento 3D da execucao.
            </Text>

            <Section style={card}>
              <Heading style={h2}>Dados de acesso</Heading>
              {companyName && <Text style={row}><strong>Empresa:</strong> {companyName}</Text>}
              <Text style={row}><strong>Login:</strong> {loginEmail}</Text>
              {temporaryPassword && (
                <Text style={row}><strong>Senha temporaria:</strong> {temporaryPassword}</Text>
              )}
            </Section>

            <Section style={ctaWrap}>
              <Button style={button} href={accessUrl}>
                Acessar ObraMap
              </Button>
            </Section>

            <Text style={security}>
              Por seguranca, altere sua senha no primeiro acesso e nao compartilhe suas credenciais.
            </Text>

            <Text style={footer}>
              Atenciosamente,<br />
              Equipe ObraMap
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: UserWelcomeEmail,
  subject: 'Bem-vindo ao ObraMap - seu acesso foi criado',
  displayName: 'Boas-vindas de novo usuario',
  previewData: {
    userName: 'Joao Silva',
    companyName: 'Construtora Exemplo',
    loginEmail: 'joao@exemplo.com',
    temporaryPassword: 'TempAbcd1234!',
    appUrl: DEFAULT_APP_URL,
    logoUrl: `${DEFAULT_APP_URL}/obramap_icon_dark.png`,
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  margin: 0,
  padding: 0,
}

const container = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '28px 20px 44px',
}

const header = {
  borderBottom: '2px solid hsl(200, 98%, 39%)',
  paddingBottom: '14px',
  marginBottom: '28px',
}

const logo = {
  display: 'block',
  height: 'auto',
}

const brand = {
  color: 'hsl(200, 98%, 39%)',
  fontSize: '22px',
  fontWeight: 800,
  margin: 0,
}

const content = {
  padding: 0,
}

const h1 = {
  color: 'hsl(222, 47%, 11%)',
  fontSize: '24px',
  fontWeight: 800,
  margin: '0 0 10px',
}

const h2 = {
  color: 'hsl(222, 47%, 11%)',
  fontSize: '17px',
  fontWeight: 700,
  margin: '0 0 12px',
}

const lead = {
  color: '#35383f',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 14px',
}

const text = {
  color: '#55575d',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 22px',
}

const card = {
  backgroundColor: 'hsl(209, 40%, 96%)',
  border: '1px solid hsl(210, 30%, 88%)',
  borderRadius: '8px',
  padding: '18px 20px',
  margin: '0 0 24px',
}

const row = {
  color: '#30333a',
  fontSize: '14px',
  lineHeight: '1.55',
  margin: '0 0 8px',
}

const ctaWrap = {
  textAlign: 'center' as const,
  margin: '8px 0 22px',
}

const button = {
  backgroundColor: 'hsl(200, 98%, 39%)',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 700,
  textDecoration: 'none',
  padding: '12px 28px',
  borderRadius: '8px',
  display: 'inline-block',
}

const security = {
  color: '#6b7280',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0 0 22px',
}

const footer = {
  color: '#8a8f99',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '22px 0 0',
  textAlign: 'center' as const,
}
