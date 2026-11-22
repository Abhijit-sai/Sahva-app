param([string]$Profile = "sahva-deploy", [string]$Aws = "aws")
$ErrorActionPreference = "Stop"
$region = "us-west-2"
$instance = "i-0b94d7413ad249aa4"
$stack = "sahva-demo-media"

function Invoke-Aws([string[]]$Arguments) {
    $result = & $Aws @Arguments --region $region --profile $Profile --no-cli-pager
    if ($LASTEXITCODE -ne 0) { throw "AWS command failed: $($Arguments[0]) $($Arguments[1])" }
    return $result
}

$details = (Invoke-Aws @("ec2", "describe-instances", "--instance-ids", $instance, "--output", "json") | ConvertFrom-Json).Reservations[0].Instances[0]
if ($details.State.Name -ne "running") { throw "The target EC2 instance is not running." }

# Never replace a profile installed by the operator or another deployment.
$current = $details.IamInstanceProfile.Arn
if ($current) {
    $owned = Invoke-Aws @("cloudformation", "describe-stack-resource", "--stack-name", $stack, "--logical-resource-id", "Profile", "--query", "StackResourceDetail.PhysicalResourceId", "--output", "text")
    if ($current.Split("/")[-1] -ne $owned) { throw "The EC2 instance has a different profile attached." }
}

$template = Join-Path $PSScriptRoot "media-storage.yml"
Invoke-Aws @("cloudformation", "deploy", "--template-file", $template, "--stack-name", $stack, "--capabilities", "CAPABILITY_IAM", "--no-fail-on-empty-changeset", "--tags", "Application=Sahva")
$outputs = (Invoke-Aws @("cloudformation", "describe-stacks", "--stack-name", $stack, "--query", "Stacks[0].Outputs", "--output", "json") | ConvertFrom-Json)
$profileName = ($outputs | Where-Object OutputKey -eq "InstanceProfile").OutputValue
$bucket = ($outputs | Where-Object OutputKey -eq "Bucket").OutputValue
if (!$profileName -or !$bucket) { throw "Media stack outputs are incomplete." }
if (!$current) {
    Invoke-Aws @("ec2", "associate-iam-instance-profile", "--instance-id", $instance, "--iam-instance-profile", "Name=$profileName", "--query", "IamInstanceProfileAssociation.State", "--output", "text")
}
if ($details.MetadataOptions.HttpPutResponseHopLimit -lt 2 -or $details.MetadataOptions.HttpTokens -ne "required" -or $details.MetadataOptions.HttpEndpoint -ne "enabled") {
    $hops = [Math]::Max(2, [int]$details.MetadataOptions.HttpPutResponseHopLimit)
    Invoke-Aws @("ec2", "modify-instance-metadata-options", "--instance-id", $instance, "--http-endpoint", "enabled", "--http-tokens", "required", "--http-put-response-hop-limit", "$hops", "--query", "InstanceMetadataOptions.State", "--output", "text")
}
Write-Output "AWS_S3_BUCKET=$bucket"
