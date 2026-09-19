-- Seed the single default user (DEFAULT_USER_ID = 1). The email pipeline and the
-- dev-mode identity fallback both write rows keyed to user 1; without this row every
-- inbound email fails on the users foreign key. The first person to log in through
-- Cloudflare Access claims this row (server/identity.ts) rather than creating a second.
INSERT INTO `users` (`id`, `email`, `name`) VALUES (1, NULL, 'Default') ON CONFLICT(`id`) DO NOTHING;
