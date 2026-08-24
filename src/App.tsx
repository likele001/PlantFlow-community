import { useEffect, type ReactNode } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ErrorBoundary from '@/components/ErrorBoundary'
import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Workflows from '@/pages/Workflows'
import WorkflowEditor from '@/pages/WorkflowEditor'
import Inbox from '@/pages/Inbox'
import Channels from '@/pages/Channels'
import Connectors from '@/pages/Connectors'
import Executions from '@/pages/Executions'
import Knowledge from '@/pages/Knowledge'
import AIModels from '@/pages/AIModels'
import PromptTemplates from '@/pages/PromptTemplates'
import Apps from '@/pages/Apps'
import Credentials from '@/pages/Credentials'
import DataSources from '@/pages/DataSources'
import AgentDebug from '@/pages/AgentDebug'
import ScenarioTemplates from '@/pages/ScenarioTemplates'
import Alerts from '@/pages/Alerts'
import CronSchedules from '@/pages/CronSchedules'
import Profile from '@/pages/Profile'
import Docs from '@/pages/Docs'
import ChatWidget from '@/pages/ChatWidget'
import BotAssistant from '@/pages/BotAssistant'
import Observability from '@/pages/Observability'
import AppShell from '@/components/AppShell'
import { useAuthStore } from '@/stores/authStore'

function RequireAuth(props: { children: ReactNode }) {
  const { token } = useAuthStore()
  const location = useLocation()
  if (!token) {
    // 未登录：跳转登录页并携带来源路径，登录成功后回跳（如 /docs）
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }
  return <>{props.children}</>
}


export default function App() {
  const { hydrate } = useAuthStore()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/chat/:apiKey" element={<ChatWidget />} />

          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="/workflows" element={<ErrorBoundary><Workflows /></ErrorBoundary>} />
            <Route path="/workflows/:id/editor" element={<ErrorBoundary><WorkflowEditor /></ErrorBoundary>} />
            <Route path="/executions" element={<ErrorBoundary><Executions /></ErrorBoundary>} />
            <Route path="/inbox" element={<ErrorBoundary><Inbox /></ErrorBoundary>} />
            <Route path="/channels" element={<ErrorBoundary><Channels /></ErrorBoundary>} />
          <Route path="/bot" element={<ErrorBoundary><BotAssistant /></ErrorBoundary>} />
            <Route path="/connectors" element={<ErrorBoundary><Connectors /></ErrorBoundary>} />
            <Route path="/ai/knowledge" element={<ErrorBoundary><Knowledge /></ErrorBoundary>} />
            <Route path="/ai/models" element={<ErrorBoundary><AIModels /></ErrorBoundary>} />
            <Route path="/ai/prompts" element={<ErrorBoundary><PromptTemplates /></ErrorBoundary>} />
            <Route path="/ai/apps" element={<ErrorBoundary><Apps /></ErrorBoundary>} />
            <Route path="/credentials" element={<ErrorBoundary><Credentials /></ErrorBoundary>} />
            <Route path="/data-sources" element={<ErrorBoundary><DataSources /></ErrorBoundary>} />
            <Route path="/agent-debug" element={<ErrorBoundary><AgentDebug /></ErrorBoundary>} />
            <Route path="/scenarios" element={<ErrorBoundary><ScenarioTemplates /></ErrorBoundary>} />
            <Route path="/alerts" element={<ErrorBoundary><Alerts /></ErrorBoundary>} />
            <Route path="/cron" element={<ErrorBoundary><CronSchedules /></ErrorBoundary>} />
            <Route path="/profile" element={<ErrorBoundary><Profile /></ErrorBoundary>} />
            <Route path="/observability" element={<ErrorBoundary><Observability /></ErrorBoundary>} />
          </Route>

          <Route path="/docs" element={<RequireAuth><ErrorBoundary><Docs /></ErrorBoundary></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  )
}
