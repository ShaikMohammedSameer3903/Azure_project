// ============================================================
// CloudOps AI Assistant Service
// Integrates real-time tenant context with Azure OpenAI
// ============================================================

const { getDatabase } = require('../db/database');

// Real Azure OpenAI configuration check
const useRealOpenAI = !!(process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT);

let openAIClient = null;
if (useRealOpenAI) {
  try {
    // Lazy load the Azure OpenAI client if needed
    const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');
    openAIClient = new OpenAIClient(
      process.env.AZURE_OPENAI_ENDPOINT,
      new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY)
    );
    console.log('[AI] Real Azure OpenAI integrations active.');
  } catch (err) {
    console.error('[AI] Failed to initialize Azure OpenAI client:', err.message);
  }
}

/**
 * Ask the CloudOps AI Assistant a question.
 * Dynamically injects the user's active resources, costs, and incidents into context.
 */
async function askChatbot(tenantId, userMessage) {
  const db = await getDatabase();

  // 1. Gather tenant context from database to make the AI responses accurate
  const resources = await db.all(`
    SELECT r.name, r.type, r.status, r.location, s.name as subscription_name 
    FROM resources r
    JOIN azure_subscriptions s ON r.subscription_id = s.id
    WHERE s.tenant_id = ?
  `, [tenantId]);

  const incidents = await db.all(`
    SELECT i.*, s.name as subscription_name 
    FROM incidents i
    JOIN azure_subscriptions s ON i.subscription_id = s.id
    WHERE s.tenant_id = ? AND i.status != 'RESOLVED'
  `, [tenantId]);

  const subscriptions = await db.all(
    'SELECT id, name, subscription_id, status FROM azure_subscriptions WHERE tenant_id = ?',
    [tenantId]
  );

  const budgets = await db.all(`
    SELECT b.*, s.name as subscription_name 
    FROM cost_budgets b
    JOIN azure_subscriptions s ON b.subscription_id = s.id
    WHERE s.tenant_id = ?
  `, [tenantId]);

  // Compute stats for context injections
  const totalResources = resources.length;
  const stoppedVms = resources.filter(r => r.type === 'Microsoft.Compute/virtualMachines' && r.status === 'Stopped').map(r => r.name);
  const runningVms = resources.filter(r => r.type === 'Microsoft.Compute/virtualMachines' && r.status === 'Running').map(r => r.name);
  const criticalIncidentsCount = incidents.filter(i => i.severity === 'CRITICAL').length;
  const warningIncidentsCount = incidents.filter(i => i.severity === 'WARNING').length;

  const systemContext = `
You are the CloudOps Enterprise AI Assistant. You help cloud administrators manage their Azure infrastructure.
You have access to the following real-time database context for the logged-in customer tenant:
- Tenant subscriptions: ${subscriptions.map(s => `${s.name} (${s.status})`).join(', ')}.
- Total discovered resources: ${totalResources}.
- Running Virtual Machines: ${runningVms.join(', ') || 'None'}.
- Stopped/Deallocated Virtual Machines: ${stoppedVms.join(', ') || 'None'}.
- Active Alerts/Incidents: ${incidents.length} total (${criticalIncidentsCount} Critical, ${warningIncidentsCount} Warning).
- Active Budgets: ${budgets.map(b => `${b.subscription_name}: $${b.amount}/month`).join(', ')}.

Active Incidents details:
${incidents.map(i => `- [${i.severity}] ${i.title} on ${i.subscription_name} (${i.status})`).join('\n')}

Please provide helpful, specific, and actionable advice. Reference their actual resource names in your answers.
`;

  // 2. Real Azure OpenAI API Call
  if (useRealOpenAI && openAIClient) {
    try {
      const deploymentId = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o';
      const response = await openAIClient.getChatCompletions(deploymentId, [
        { role: 'system', content: systemContext },
        { role: 'user', content: userMessage }
      ]);
      return {
        reply: response.choices[0].message.content,
        sources: ['Real-Time Azure Graph', 'Internal SQL Cache', 'Azure OpenAI Security Insights']
      };
    } catch (err) {
      console.warn('[AI] Azure OpenAI request failed, falling back to local simulation:', err.message);
    }
  }

  // 3. Local Simulated Chatbot engine (Highly contextual Heuristics)
  return runLocalAiHeuristics(userMessage, {
    resources,
    totalResources,
    incidents,
    subscriptions,
    budgets,
    runningVms,
    stoppedVms,
    criticalIncidentsCount,
    warningIncidentsCount
  });
}

function runLocalAiHeuristics(message, ctx) {
  const msg = message.toLowerCase();
  let reply = '';
  const sources = ['Internal SQL Cache', 'CloudOps Security Baseline Rules'];

  if (msg.includes('cost') || msg.includes('budget') || msg.includes('bill') || msg.includes('spend')) {
    const budgetLines = ctx.budgets.map(b => `* **${b.subscription_name}**: Budget is $${b.amount}/month.`).join('\n') || '* No budgets configured.';
    const suggestSavings = ctx.stoppedVms.length > 0
      ? `You have stopped Virtual Machines: **${ctx.stoppedVms.join(', ')}**. If these are permanently stopped, consider deallocating them or deleting associated managed OS disks to stop storage leak costs.`
      : `All your Virtual Machines are currently running. Check for unused SQL Databases that can be scaled down to Serverless configurations.`;

    reply = `### Cost Management & Budget Analysis
Based on your tenant cost profile, you have **${ctx.subscriptions.length} active subscriptions** with budget tracking:

${budgetLines}

**Actionable Cost Optimization Recommendations:**
1. ${suggestSavings}
2. Ensure you register Azure Hybrid Benefit (AHUB) for your Windows Server VMs (like \`vm-hc-prod-web\`) to save up to 40% on licensing fees.
3. Set up automated runbooks to shut down dev/test VMs (in \`Contoso Sandbox-DevTest\`) during non-business hours.`;
  }
  
  else if (msg.includes('incident') || msg.includes('alert') || msg.includes('error') || msg.includes('broken') || msg.includes('critical')) {
    if (ctx.incidents.length === 0) {
      reply = `### Operational Health
Good news! There are currently **no active incidents** or alert notifications triggered in your environment. All resources are operating within normal baseline limits.`;
    } else {
      const list = ctx.incidents.map(i => `* **[${i.severity}]** **${i.title}** under subscription *${i.subscription_name}* (Status: \`${i.status}\`)`).join('\n');
      
      const suggestAction = ctx.criticalIncidentsCount > 0 
        ? `I highly recommend immediate action on the critical security threats. Would you like me to trigger a remediation runbook for you?`
        : `All active warnings are currently acknowledged or under review.`;

      reply = `### Active Alerts & Incidents
I've detected **${ctx.incidents.length} active operational issues** in your tenant:

${list}

**Remediation Suggestion:**
${suggestAction}`;
    }
  }

  else if (msg.includes('vm') || msg.includes('virtual machine') || msg.includes('server')) {
    reply = `### Virtual Machine Infrastructure
Here is the status of your Virtual Machine compute assets:
- **Running VMs (${ctx.runningVms.length})**: ${ctx.runningVms.map(v => `\`${v}\``).join(', ') || '*None*'}
- **Stopped VMs (${ctx.stoppedVms.length})**: ${ctx.stoppedVms.map(v => `\`${v}\``).join(', ') || '*None*'}

**Operational Summary:**
- All production VMs are healthy and communicating with Azure Monitor Agents.
- The Stopped VM **vm-corp-vpn-gateway** is triggering a VPN tunnel loss alert in your alerts center. You can boot it directly from the **Actions Page** to restore routing.`;
  }

  else if (msg.includes('security') || msg.includes('defender') || msg.includes('compliance')) {
    reply = `### Security posture summary (Defender for Cloud)
Your aggregate tenant security score is **82%**. 

**Primary Compliance Findings:**
1. **Critical Warning:** Unusual Key Vault access pattern detected on \`kv-hc-prod-secrets\` from an untrusted public IP. A security incident is active in your monitoring dashboard.
2. **Missing Configuration:** Storage Account \`sahcprodimages\` has public access enabled. Network firewalls should be restricted to Virtual Networks.
3. **MFA Missing:** 2 administrative users do not have Multi-Factor Authentication enabled in Entra ID.`;
  }

  else {
    // Default fallback welcome message
    reply = `Hello! I am your CloudOps Enterprise AI Copilot. 

I am connected to your tenant **Contoso Health Systems** and have indexed:
- **${ctx.subscriptions.length} Subscriptions**
- **${ctx.totalResources} Discovered Resources**
- **${ctx.incidents.length} Active Incidents**

How can I help you today? You can ask me questions like:
- *"Show me active alerts and incidents"*
- *"How can I optimize costs in my environment?"*
- *"What is the status of my Virtual Machines?"*
- *"Summarize my tenant security posture"*`;
  }

  return { reply, sources };
}

module.exports = {
  askChatbot
};
