export function pendantDescription(powered: boolean, activated: boolean): string {
  if (activated) {
    return '電池仍有微弱電力。握緊後，吊飾播放了熟悉的旋律。';
  }
  if (powered) {
    return '已裝入舊電池。握住吊飾時，按住手機中央互動鍵。';
  }
  return '主角送給女友的錄音吊飾，背面的電池槽目前是空的。';
}
