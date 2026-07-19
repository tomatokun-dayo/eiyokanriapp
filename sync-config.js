// Supabase接続情報（夫婦データ同期用）。
// SUPABASE_URL と SUPABASE_KEY(publishable) は公開前提の値。
// 守りはキーではなく Supabase 側の RLS（membersの2人のみ許可）＋新規サインアップ無効化で行う。
// どちらかを空文字にすると同期機能は完全に休眠し、ローカル専用アプリとして動作する。
window.SYNC_CONFIG = {
  SUPABASE_URL: "https://ocjjohcbyqtfgypjujow.supabase.co",
  SUPABASE_KEY: "sb_publishable_McqqPzRdUTGpZ3A9LNqghQ_DW_PbcZl",
};
