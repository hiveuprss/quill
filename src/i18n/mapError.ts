import type { TFunction } from 'i18next';

/** Map known English worker/API errors to locale keys for UI display. */
export function localizeError(message: string, t: TFunction): string {
  const msg = message.trim();

  const rate = msg.match(/^Too many failed attempts\. Try again in (\d+)s$/i);
  if (rate) return t('errors.rateLimited', { seconds: rate[1] });

  const uploadStatus = msg.match(/^Upload failed \((\d+)\)$/i);
  if (uploadStatus) return t('errors.uploadFailedStatus', { status: uploadStatus[1] });

  const exact: Record<string, string> = {
    'Account already enrolled. Wipe existing account in Settings to re-enroll.':
      'errors.alreadyEnrolled',
    'Invalid posting key (WIF).': 'errors.invalidWif',
    'Account not found.': 'errors.accountNotFound',
    'This key is not a posting authority for the account.': 'errors.notPostingAuth',
    'No enrolled account.': 'errors.noEnrolled',
    'Key mismatch in envelope.': 'errors.keyMismatch',
    'Incorrect passphrase.': 'errors.incorrectPassphrase',
    'Only comment and comment_options operations are allowed.': 'errors.opsAllowlist',
    'Operation author does not match the enrolled account.': 'errors.opsAuthorMismatch',
    'comment_options permlink must match the comment.': 'errors.opsPermlinkMismatch',
    'Passphrase confirmation failed.': 'errors.passphraseConfirmFailed',
    'API nodes disagree on your key status — publish blocked for safety.':
      'errors.nodesDisagree',
    'Could not verify key rotation status.': 'errors.rotationVerifyFailed',
    'Two independent Hive nodes report this posting key is no longer authorised. Publishing is blocked. Your encrypted key has been kept — remove it in Settings once you have confirmed the rotation.':
      'errors.keyRotatedRetained',
    'Unlock required before upload.': 'errors.unlockRequiredUpload',
    'Upload must follow a user file-picker gesture.': 'errors.uploadGesture',
    'Upload rate limited — wait a moment.': 'errors.uploadRateLimited',
    'Image too large for images.hive.blog': 'errors.imageTooLarge',
    'Upload rate limited — try again later': 'errors.uploadRateLimitedLater',
    'Upload response URL rejected (must be https://images.hive.blog/…)':
      'errors.uploadUrlRejected',
  };

  const key = exact[msg];
  return key ? t(key) : msg;
}
