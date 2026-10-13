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
      .setMaxLength(128))
    .toJSON()
];
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
await rest.put(
  Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
  { body: commands }
);
console.log('Registered HelzerX order slash commands for the configured guild.');
