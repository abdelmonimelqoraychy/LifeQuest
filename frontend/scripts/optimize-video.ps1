param([string]$SourceName='level-05.mp4',[string]$OutputName='level-05.optimized.mp4')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.StorageFolder,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Transcoding.MediaTranscoder,Windows.Media.Transcoding,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.MediaProperties.MediaEncodingProfile,Windows.Media.MediaProperties,ContentType=WindowsRuntime] | Out-Null
function Await-Operation($operation,[Type]$resultType){
 $method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation'+[char]96+'1' } | Select-Object -First 1
 $task=$method.MakeGenericMethod($resultType).Invoke($null,@($operation))
 return $task.GetAwaiter().GetResult()
}
$mediaRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/cinematics'))
$sourcePath=[IO.Path]::GetFullPath((Join-Path $mediaRoot $SourceName))
$outputPath=[IO.Path]::GetFullPath((Join-Path $mediaRoot $OutputName))
if([IO.Path]::GetDirectoryName($sourcePath) -ne $mediaRoot -or [IO.Path]::GetDirectoryName($outputPath) -ne $mediaRoot -or $sourcePath -eq $outputPath){throw 'Paths must be distinct files inside public/cinematics'}
$source=Await-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($sourcePath)) ([Windows.Storage.StorageFile])
$folder=Await-Operation ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($mediaRoot)) ([Windows.Storage.StorageFolder])
$output=Await-Operation ($folder.CreateFileAsync($OutputName,[Windows.Storage.CreationCollisionOption]::FailIfExists)) ([Windows.Storage.StorageFile])
$profile=[Windows.Media.MediaProperties.MediaEncodingProfile]::CreateMp4([Windows.Media.MediaProperties.VideoEncodingQuality]::HD720p)
$profile.Video.Bitrate=1400000
$transcoder=New-Object Windows.Media.Transcoding.MediaTranscoder
$prepared=Await-Operation ($transcoder.PrepareFileTranscodeAsync($source,$output,$profile)) ([Windows.Media.Transcoding.PrepareTranscodeResult])
if(!$prepared.CanTranscode){throw ('Transcoding unavailable: '+$prepared.FailureReason)}
$operation=$prepared.TranscodeAsync()
$method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncActionWithProgress'+[char]96+'1' } | Select-Object -First 1
$task=$method.MakeGenericMethod([double]).Invoke($null,@($operation))
$task.GetAwaiter().GetResult()
Get-Item -LiteralPath $sourcePath,$outputPath | Select-Object Name,Length
