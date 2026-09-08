import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import MessScreen, { Container } from '../../src/features/meal-management/MessScreen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import { Body } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  ApprovalActions,
  BackLink,
  Badge,
  Chip,
  ChipRow,
  Divider,
  Empty,
  Field,
  GroupLabel,
  Loading,
  MemberRow,
  MiniButton,
  Panel,
  Row,
  Sheet,
  StatTile,
  TileGrid,
} from '../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../src/features/meal-management/store';
import { useMealAction } from '../../src/features/meal-management/errors';
import { copyText } from '../../src/features/meal-management/share';
import { MEMBER_STATE_TEXT, ROLE_TEXT, agoLabel } from '../../src/features/meal-management/format';

/**
 * Members, roles, invitations and history. §4.1.
 *
 * The rule that shapes this screen is §4.1's own: *member removal must not
 * delete historical meal or financial records*. So there is no delete. A
 * member leaves, which sets a status and a date, and every figure that points
 * at them stays exactly where it was — which is why the history tab exists and
 * why it is worth reading.
 */
export default function Members() {
  const { t, n } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const {
    mess,
    can,
    dashboard,
    addGhostMember,
    updateMember,
    transferOwnership,
    createInvite,
    revokeInvite,
    decideJoinRequest,
    leaveMess,
    load,
  } = useMealManagement();

  const { data, loading } = useSlice('members');
  const requests = useSlice('joinRequests');
  const invites = useSlice('invites');

  const [tab, setTab] = useState('people');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);

  useFocusEffect(
    useCallback(() => {
      load.members({ force: true });
      if (can('manage_members')) {
        load.joinRequests({ force: true });
        load.invites({ force: true });
      }
      load.memberHistory();
    }, [load, can]),
  );

  const history = useSlice('memberHistory');
  const members = data?.members ?? [];
  const active = members.filter((m) => m.status === 'active');
  const manage = can('manage_members');
  const myId = dashboard?.mess?.memberId;

  const decide = async (id, approve) => {
    setBusy(id);
    await run(
      () => decideJoinRequest(id, approve),
      approve ? t('Member added.') : t('Request rejected.'),
    );
    setBusy(null);
  };

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/more" />

        <SectionHeader
          lead={t('THE')}
          accent={t('MEMBERS')}
          subtitle={mess?.name}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <ChipRow>
            <Chip label={t('People')} active={tab === 'people'} onPress={() => setTab('people')} />
            {manage ? (
              <Chip
                label={t('Requests')}
                active={tab === 'requests'}
                onPress={() => setTab('requests')}
                tone={requests.data?.requests?.length ? 'warn' : 'primary'}
              />
            ) : null}
            {manage ? (
              <Chip label={t('Invite')} active={tab === 'invite'} onPress={() => setTab('invite')} />
            ) : null}
            <Chip label={t('History')} active={tab === 'history'} onPress={() => setTab('history')} />
          </ChipRow>
        </View>

        {loading && !data ? (
          <Loading />
        ) : tab === 'people' ? (
          <>
            <View style={{ marginTop: 18 }}>
              <TileGrid>
                <StatTile value={n(active.length)} label={t('Active members')} />
                <StatTile
                  value={n(active.filter((m) => m.ghost).length)}
                  label={t('Without the app')}
                />
              </TileGrid>
            </View>

            {manage ? (
              <View style={{ marginTop: 16 }}>
                <MiniButton
                  label={t('Add somebody without the app')}
                  icon="plus"
                  tone="plain"
                  onPress={() => setAdding(true)}
                />
              </View>
            ) : null}

            <View style={{ marginTop: 18, gap: 10, marginBottom: 8 }}>
              <GroupLabel text={t('In the mess')} />
              <Panel style={{ gap: 2 }}>
                {active.map((member) => (
                  <MemberRow
                    key={member.memberId}
                    name={`${member.name}${member.memberId === myId ? ` · ${t('you')}` : ''}`}
                    role={t(ROLE_TEXT[member.role] ?? member.role)}
                    sub={member.ghost ? t('no app account') : member.phone || undefined}
                    ghost={member.ghost}
                    onPress={manage ? () => setEditing(member) : undefined}
                    right={
                      manage ? (
                        <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
                          {t('Edit')}
                        </Text>
                      ) : null
                    }
                  />
                ))}
              </Panel>

              {members.some((m) => m.status !== 'active') ? (
                <>
                  <GroupLabel text={t('No longer active')} />
                  <Panel style={{ gap: 2 }}>
                    {members
                      .filter((m) => m.status !== 'active')
                      .map((member) => (
                        <MemberRow
                          key={member.memberId}
                          name={member.name}
                          role={t(MEMBER_STATE_TEXT[member.status] ?? member.status)}
                          onPress={manage ? () => setEditing(member) : undefined}
                        />
                      ))}
                  </Panel>
                  <Body muted style={{ fontSize: type.xs }}>
                    {t('Their meals and money stay in every month they were part of.')}
                  </Body>
                </>
              ) : null}

              <MiniButton
                label={t('Leave this mess')}
                icon="x"
                tone="bad"
                onPress={() => run(() => leaveMess(), t('You have left the mess.'))}
              />
            </View>
          </>
        ) : tab === 'requests' ? (
          <View style={{ marginTop: 18, gap: 10, marginBottom: 8 }}>
            <GroupLabel
              text={t('Waiting to join')}
              right={<Badge count={requests.data?.requests?.length} />}
            />

            {requests.data?.requests?.length ? (
              requests.data.requests.map((request) => (
                <Panel key={request.id} tone="warn" style={{ gap: 10 }}>
                  <MemberRow
                    name={request.name || t('Somebody')}
                    sub={`${request.phone || ''} ${agoLabel(request.at, t)}`.trim()}
                  />
                  {request.note ? (
                    <Body muted style={{ fontSize: type.xs }}>
                      {request.note}
                    </Body>
                  ) : null}
                  <ApprovalActions
                    busy={busy === request.id}
                    onApprove={() => decide(request.id, true)}
                    onReject={() => decide(request.id, false)}
                  />
                </Panel>
              ))
            ) : (
              <Empty icon="user" title={t('Nobody is waiting')} />
            )}
          </View>
        ) : tab === 'invite' ? (
          <View style={{ marginTop: 18, gap: 12, marginBottom: 8 }}>
            <GroupLabel text={t('The mess code')} />

            <Panel style={{ alignItems: 'center', gap: 10, paddingVertical: 22 }}>
              <Text
                style={{
                  fontFamily: font.displayBold,
                  fontSize: 34,
                  letterSpacing: 6,
                  color: colors.text,
                }}
              >
                {invites.data?.code ?? '······'}
              </Text>
              <Body muted style={{ fontSize: type.xs, textAlign: 'center' }}>
                {t('Anybody with this code can ask to join.')}
              </Body>
              <MiniButton
                label={t('Copy the code')}
                icon="copy"
                tone="plain"
                onPress={async () => {
                  await copyText(invites.data?.code ?? '');
                  run(() => Promise.resolve({ ok: true }), t('Copied.'));
                }}
              />
            </Panel>

            <GroupLabel text={t('One-off invitations')} />

            <MiniButton
              label={t('Create an invitation')}
              icon="plus"
              onPress={() =>
                run(() => createInvite({ expiresInDays: 7, maxUses: 1 }), t('Invitation created.'))
              }
            />

            {invites.data?.invites?.length ? (
              <Panel style={{ gap: 2 }}>
                {invites.data.invites.map((invite) => (
                  <Row
                    key={invite.id}
                    label={`${invite.code} · ${
                      invite.maxUses ? t('{used}/{max} used', { used: invite.uses, max: invite.maxUses }) : t('unlimited')
                    }`}
                    value={t('Revoke')}
                    tone="bad"
                    onPress={() => run(() => revokeInvite(invite.id), t('Revoked.'))}
                  />
                ))}
              </Panel>
            ) : null}

            <Body muted style={{ fontSize: type.xs }}>
              {t('An invitation can expire or run out of uses. The mess code never does.')}
            </Body>
          </View>
        ) : (
          <View style={{ marginTop: 18, gap: 10, marginBottom: 8 }}>
            <GroupLabel text={t('Everyone who has ever been here')} />

            {history.data?.members?.length ? (
              history.data.members.map((member) => (
                <Panel key={member.memberId} style={{ gap: 6 }}>
                  <MemberRow
                    name={member.name}
                    role={t(ROLE_TEXT[member.role] ?? member.role)}
                    sub={t(MEMBER_STATE_TEXT[member.status] ?? member.status)}
                    ghost={member.ghost}
                  />
                  {member.history?.length ? (
                    <>
                      <Divider />
                      {member.history.map((event, index) => (
                        <Row
                          // eslint-disable-next-line react/no-array-index-key
                          key={index}
                          label={event.note || t(MEMBER_STATE_TEXT[event.status] ?? event.status)}
                          value={agoLabel(event.at, t)}
                        />
                      ))}
                    </>
                  ) : null}
                </Panel>
              ))
            ) : (
              <Loading />
            )}
          </View>
        )}
      </Container>

      <EditSheet
        member={editing}
        onClose={() => setEditing(null)}
        canTransfer={can('mess_settings')}
        onSave={async (patch) => {
          const out = await run(() => updateMember(editing.memberId, patch), t('Member updated.'));
          if (out?.ok) setEditing(null);
          return out;
        }}
        onTransfer={async () => {
          const out = await run(
            () => transferOwnership(editing.memberId),
            t('They are the admin now.'),
          );
          if (out?.ok) setEditing(null);
          return out;
        }}
      />

      <GhostSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSubmit={async (body) => {
          const out = await run(() => addGhostMember(body), t('Member added.'));
          if (out?.ok) setAdding(false);
          return out;
        }}
      />
    </MessScreen>
  );
}

/* ------------------------------------------------------------------ *
 * sheets
 * ------------------------------------------------------------------ */

function EditSheet({ member, onClose, canTransfer, onSave, onTransfer }) {
  const { t } = useLang();

  const [role, setRole] = useState(member?.role ?? 'member');
  const [status, setStatus] = useState(member?.status ?? 'active');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    setRole(member?.role ?? 'member');
    setStatus(member?.status ?? 'active');
  }, [member]);

  if (!member) return null;

  const save = async () => {
    setBusy(true);
    await onSave({ role, status });
    setBusy(false);
  };

  return (
    <Sheet
      open={!!member}
      onClose={onClose}
      title={member.name}
      footer={<Button label={t('Save')} onPress={save} disabled={busy} block />}
    >
      <View style={{ gap: 8 }}>
        <GroupLabel text={t('Role')} />
        <ChipRow>
          {['admin', 'coadmin', 'member'].map((key) => (
            <Chip
              key={key}
              label={t(ROLE_TEXT[key])}
              active={role === key}
              disabled={member.ghost && key !== 'member'}
              onPress={() => setRole(key)}
            />
          ))}
        </ChipRow>
        {member.ghost ? (
          <Body muted style={{ fontSize: 12 }}>
            {t('Somebody without an app account can only be a member.')}
          </Body>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('Status')} />
        <ChipRow>
          {['active', 'inactive', 'suspended', 'left'].map((key) => (
            <Chip
              key={key}
              label={t(MEMBER_STATE_TEXT[key])}
              active={status === key}
              tone={key === 'active' ? 'good' : key === 'left' ? 'bad' : 'warn'}
              onPress={() => setStatus(key)}
            />
          ))}
        </ChipRow>
        <Body muted style={{ fontSize: 12 }}>
          {t('Their meals and money stay in every month they were part of, whatever this says.')}
        </Body>
      </View>

      {canTransfer && !member.ghost && member.status === 'active' ? (
        <View style={{ gap: 8 }}>
          <GroupLabel text={t('Hand the mess over')} />
          <MiniButton
            label={t('Make {name} the admin', { name: member.name })}
            icon="shield"
            tone="warn"
            onPress={onTransfer}
          />
          <Body muted style={{ fontSize: 12 }}>
            {t('You become a co-admin. Only an admin can settle a month or change settings.')}
          </Body>
        </View>
      ) : null}
    </Sheet>
  );
}

function GhostSheet({ open, onClose, onSubmit }) {
  const { t } = useLang();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await onSubmit({ name: name.trim(), phone: phone.trim() || undefined });
    setBusy(false);
    setName('');
    setPhone('');
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Add somebody without the app')}
      footer={<Button label={t('Add them')} onPress={submit} disabled={busy || !name.trim()} block />}
    >
      <Field label={t('Name')} value={name} onChangeText={setName} maxLength={80} />
      <Field
        label={t('Phone (optional)')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={24}
      />

      <Body muted style={{ fontSize: 12 }}>
        {t(
          'They get meals, expenses and a balance like anybody else — you record them on their behalf. If they install the app later, an admin can link the two.',
        )}
      </Body>
    </Sheet>
  );
}
