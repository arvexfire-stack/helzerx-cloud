import {
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

const required = ['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID', 'DISCORD_SERVICE_TOKEN'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}
const apiBase = (process.env.ORDER_API_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const guildId = process.env.DISCORD_GUILD_ID;
const staffRoleId = process.env.DISCORD_STAFF_ROLE_ID || '';
const categoryId = process.env.DISCORD_TICKET_CATEGORY_ID || '';
const token = process.env.DISCORD_BOT_TOKEN;
const serviceToken = process.env.DISCORD_SERVICE_TOKEN;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function apiGet(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { authorization: `Bearer ${serviceToken}` },
    signal: AbortSignal.timeout(8000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `API returned ${response.status}`);
    error.status = response.status;
    error.code = payload.error;
    throw error;
  }
  return payload;
}

async function apiPost(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${serviceToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `API returned ${response.status}`);
    error.status = response.status;
    error.code = payload.error;
    error.currentState = payload.currentState;
    error.expectedAmount = payload.expectedAmount;
    error.expectedCurrency = payload.expectedCurrency;
    throw error;
  }
  return payload;
}

client.once('ready', () => {
  console.log(JSON.stringify({ event: 'discord_bot_ready', userId: client.user.id }));
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild() || interaction.guildId !== guildId) {
    return interaction.reply({ content: 'Please use this command in the official HelzerX server.', ephemeral: true });
  }
  if (['order-status', 'payment-review', 'ticket-retry'].includes(interaction.commandName)) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!staffRoleId || !member?.roles.cache.has(staffRoleId)) {
      return interaction.reply({ content: 'This command is restricted to authorized HelzerX staff.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      if (interaction.commandName === 'ticket-retry') {
        const reference = interaction.options.getString('reference', true).trim().toUpperCase();
        const pending = await apiGet(`/api/v1/internal/discord/pending-tickets?guildId=${guildId}`);
        const item = pending.tickets.find(ticket => ticket.reference === reference);
        if (!item) return interaction.editReply({ content: 'No pending ticket recovery was found for that reference. It may already be linked, or staff must investigate the order manually.' });
        if (!item.discordUserId) return interaction.editReply({ content: 'This order has no linked Discord customer. Manual staff recovery is required.' });
        const everyoneRole = interaction.guild.roles.everyone;
        const permissionOverwrites = [
          { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: item.discordUserId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
        ];
        if (staffRoleId) permissionOverwrites.push({ id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
        const channel = await interaction.guild.channels.create({
          name: `order-${item.reference.toLowerCase()}`,
          type: ChannelType.GuildText,
          ...(categoryId ? { parent: categoryId } : {}),
          topic: `HelzerX order ${item.reference} | customer ${item.discordUserId}`,
          permissionOverwrites,
          reason: `Staff recovery for order ${item.reference}`
        });
        try {
          const plan = item.plan || {};
          const embed = new EmbedBuilder()
            .setTitle('HelzerX Cloud — Recovered Order Ticket')
            .setDescription('A staff member recovered this order ticket. Please do not post passwords, API keys, or other secrets.')
            .addFields(
              { name: 'Order reference', value: item.reference, inline: true },
              { name: 'Plan', value: item.planId, inline: true },
              { name: 'Monthly price', value: `${item.currency} ${Number(item.monthlyAmount).toFixed(2)} / month`, inline: true },
              { name: 'Resources', value: `${plan.ramGb ?? '—'} GB RAM • ${plan.vcpu ?? '—'} vCPU • ${plan.diskGb ?? '—'} GB disk`, inline: false }
            ).setTimestamp();
          await channel.send({
            content: `<@${item.discordUserId}>${staffRoleId ? ` <@&${staffRoleId}>` : ''}`,
            embeds: [embed],
            allowedMentions: { users: [item.discordUserId], roles: staffRoleId ? [staffRoleId] : [] }
          });
          await apiPost('/api/v1/internal/discord/ticket-channel', { orderId: item.orderId, guildId, channelId: channel.id });
        } catch (error) {
          console.error(JSON.stringify({ event: 'ticket_recovery_failed', orderReference: item.reference, errorName: error.name, errorCode: error.code ?? null, errorMessage: error.message ?? null, discordCode: error.rawError?.code ?? null, discordMessage: error.rawError?.message ?? null, method: error.method ?? error.request?.method ?? null, url: error.url ?? error.request?.url ?? null }));
          await interaction.editReply({ content: `A recovery channel was created but could not be linked. Keep it private and contact the system administrator. Reference: ${item.reference}` });
          return;
        }
        return interaction.editReply({ content: `Recovered private ticket for **${item.reference}**: ${channel}` });
      }
      if (interaction.commandName === 'order-status') {
        const reference = interaction.options.getString('reference', true).trim().toUpperCase();
        const response = await apiPost('/api/v1/internal/staff/order-status', { reference });
        const order = response.order;
        return interaction.editReply({
          content: `**Order ${order.reference}**\nPlan: ${order.planId}\nStatus: ${order.status}\nMonthly price: ${order.currency} ${Number(order.monthlyAmount).toFixed(2)}\nCustomer: ${order.discordUserId ? `<@${order.discordUserId}>` : 'Not linked'}`
        });
      }
      const reference = interaction.options.getString('reference', true).trim().toUpperCase();
      const decision = interaction.options.getString('decision', true);
      const amount = interaction.options.getNumber('amount', true);
      const currency = interaction.options.getString('currency', true).trim().toUpperCase();
      const reason = interaction.options.getString('reason', true).trim();
      const evidenceReference = interaction.options.getString('evidence', false)?.trim() || '';
      const result = await apiPost('/api/v1/internal/staff/payment-review', {
        reference, decision, amount, currency, reason, evidenceReference,
        reviewerDiscordId: interaction.user.id
      });
      return interaction.editReply({
        content: `Payment review recorded for **${result.reference}**. New status: **${result.status}**. Provisioning was not started.`
      });
    } catch (error) {
      const messages = {
        order_not_found: 'Order not found. Check the reference.',
        order_state_conflict: `This order cannot be reviewed from its current status (${error.currentState || 'changed'}).`,
        payment_amount_mismatch: `Amount/currency mismatch. Expected ${error.expectedCurrency || 'the order currency'} ${error.expectedAmount ?? 'the order amount'}.`
      };
      return interaction.editReply({ content: messages[error.code] || (error.status === 404 ? 'Order not found.' : error.status === 409 ? 'The order changed or the payment details do not match. Re-check the order before retrying.' : 'The order service is unavailable. No confirmation was recorded.') });
    }
  }
  if (interaction.commandName !== 'claim') return;
  const code = interaction.options.getString('code', true).trim();
  await interaction.deferReply({ ephemeral: true });
  let claimed;
  try {
    claimed = await apiPost('/api/v1/internal/discord/claim', {
      code,
      discordUserId: interaction.user.id,
      guildId: interaction.guildId
    });
  } catch (error) {
    const message = error.status === 404
      ? 'That claim code is invalid, expired, or already used. Please check the code or contact support.'
      : 'The order service is temporarily unavailable. Please try again later.';
    return interaction.editReply({ content: message });
  }

  const order = claimed.order;
  let channel;
  try {
    const everyoneRole = interaction.guild.roles.everyone;
    const permissionOverwrites = [
      { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ] },
      { id: client.user.id, allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels
      ] }
    ];
    if (staffRoleId) permissionOverwrites.push({
      id: staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
    channel = await interaction.guild.channels.create({
      name: `order-${order.reference.toLowerCase()}`,
      type: ChannelType.GuildText,
      ...(categoryId ? { parent: categoryId } : {}),
      topic: `HelzerX order ${order.reference} | customer ${interaction.user.id}`,
      permissionOverwrites,
      reason: `Create private order ticket ${order.reference}`
    });
    const plan = order.plan || {};
    const embed = new EmbedBuilder()
      .setTitle('HelzerX Cloud — Order Support')
      .setDescription('Welcome! A staff member will review your order here. Please do not post passwords, API keys, or other secrets.')
      .addFields(
        { name: 'Order reference', value: String(order.reference), inline: true },
        { name: 'Plan', value: String(order.planId), inline: true },
        { name: 'Monthly price', value: `${order.currency} ${Number(order.monthlyAmount).toFixed(2)} / month`, inline: true },
        { name: 'Resources', value: `${plan.ramGb ?? '—'} GB RAM • ${plan.vcpu ?? '—'} vCPU • ${plan.diskGb ?? '—'} GB disk`, inline: false },
        { name: 'Customer', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Status', value: 'Awaiting staff review', inline: true }
      )
      .setFooter({ text: 'HelzerX Cloud • Never share passwords in tickets' })
      .setTimestamp();
    await channel.send({
      content: `<@${interaction.user.id}>${staffRoleId ? ` <@&${staffRoleId}>` : ''}`,
      embeds: [embed],
      allowedMentions: { users: [interaction.user.id], roles: staffRoleId ? [staffRoleId] : [] }
    });
    await apiPost('/api/v1/internal/discord/ticket-channel', {
      orderId: order.id,
      guildId: interaction.guildId,
      channelId: channel.id
    });
    await interaction.editReply({ content: `Your private order ticket is ready: ${channel}` });
  } catch (error) {
    console.error(JSON.stringify({ event: 'ticket_creation_failed', orderId: order.id, orderReference: order.reference, errorName: error.name, errorCode: error.code ?? null, errorMessage: error.message ?? null, discordCode: error.rawError?.code ?? null, discordMessage: error.rawError?.message ?? null, method: error.method ?? error.request?.method ?? null, url: error.url ?? error.request?.url ?? null }));
    if (channel) {
      try { await channel.send('Ticket setup is incomplete. Please wait for staff; do not submit your claim code again.'); } catch {}
    }
    await interaction.editReply({ content: 'Your claim was accepted, but the private ticket could not be fully set up. Staff have been alerted through service logs; please contact support and include order reference ' + order.reference + '.' });
  }
});

client.login(token);
