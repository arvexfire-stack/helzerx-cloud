import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const required = ['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}
const commands = [
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Link your HelzerX Cloud order and create a private support ticket')
    .addStringOption(option => option
      .setName('code')
      .setDescription('One-time order claim code')
      .setRequired(true)
      .setMinLength(32)
      .setMaxLength(128)),
  new SlashCommandBuilder()
    .setName('order-status')
    .setDescription('Staff only: inspect an order status')
    .addStringOption(option => option
      .setName('reference')
      .setDescription('Order reference, e.g. HX-0123456789')
      .setRequired(true)
      .setMinLength(13)
      .setMaxLength(13)),
  new SlashCommandBuilder()
    .setName('payment-review')
    .setDescription('Staff only: record manual payment approval or rejection')
    .addStringOption(option => option
      .setName('reference')
      .setDescription('Order reference, e.g. HX-0123456789')
      .setRequired(true)
      .setMinLength(13)
      .setMaxLength(13))
    .addStringOption(option => option
      .setName('decision')
      .setDescription('Approve or reject the payment')
      .setRequired(true)
      .addChoices({ name: 'Approve', value: 'approve' }, { name: 'Reject', value: 'reject' }))
    .addNumberOption(option => option
      .setName('amount')
      .setDescription('Exact amount received, in the order currency')
      .setRequired(true)
      .setMinValue(0.01))
    .addStringOption(option => option
      .setName('currency')
      .setDescription('Three-letter currency code, e.g. USD')
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(3))
    .addStringOption(option => option
      .setName('reason')
      .setDescription('Required review notes / reason')
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(1000))
    .addStringOption(option => option
      .setName('evidence')
      .setDescription('Optional payment reference; do not include secrets')
      .setRequired(false)
      .setMaxLength(500))
];
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
await rest.put(
  Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
  { body: commands.map(command => command.toJSON()) }
);
console.log('Registered HelzerX order slash commands for the configured guild.');
