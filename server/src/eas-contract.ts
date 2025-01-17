import EASAbi from '../../contract/abi/EAS.json'
import IDCAbi from '../../contract/abi/IDC.json'
import config from '../config'
import { ethers } from 'ethers'
import { type EAS, type IDC } from '../../contract/typechain-types'
const provider = new ethers.providers.JsonRpcProvider(config.provider)
const eas = new ethers.Contract(config.easContract, EASAbi, provider) as EAS
interface VerifyParameters {
  signature: string
  sld: string
  alias: string
  forwardAddress: string
}

export async function getOwner (sld: string): Promise<string> {
  const dcAddress = await eas.dc()
  const dc = new ethers.Contract(dcAddress, IDCAbi, provider) as IDC
  const r = await dc.ownerOf(sld)
  return r.toLowerCase()
}

export async function isOwnerOrAllowedMaintainer (sld: string, address: string): Promise<boolean> {
  const isMaintainer = await eas.hasRole(await eas.MAINTAINER_ROLE(), address)
  const allowMaintainer = await eas.getAllowMaintainerAccess(ethers.utils.id(sld))
  if (allowMaintainer && isMaintainer) {
    return true
  }
  const owner = await getOwner(sld)
  if (owner.toLowerCase() === address.toLowerCase()) {
    return true
  }
  return false
}

interface VerifyCommitmentResult {
  actualCommitment?: string
  expectedCommitment?: string
  success: boolean
}
export async function verifyCommitment ({ signature, sld, alias, forwardAddress }: VerifyParameters): Promise<VerifyCommitmentResult> {
  const actualCommitment = await eas.getCommitment(ethers.utils.id(sld), ethers.utils.id(alias))
  const separator = ethers.utils.toUtf8Bytes(await eas.SEPARATOR())
  const data = ethers.utils.concat([ethers.utils.toUtf8Bytes(alias), separator, ethers.utils.toUtf8Bytes(forwardAddress), separator, signature])
  const expectedCommitment = ethers.utils.keccak256(data)
  return { success: expectedCommitment === actualCommitment, actualCommitment, expectedCommitment }
}

export async function verifyDeactivation (sld: string, alias: string): Promise<boolean> {
  const c = await eas.getCommitment(ethers.utils.id(sld), ethers.utils.id(alias))
  return ethers.BigNumber.from(c).eq(0)
}

export async function isAllDeactivated (sld: string): Promise<boolean> {
  const r = await eas.getNumAlias(ethers.utils.id(sld))
  return r.eq(0)
}

export async function verifySignature ({ signature, sld, alias, forwardAddress }: VerifyParameters): Promise<boolean> {
  const digest = ethers.utils.hashMessage(config.message(sld, alias, forwardAddress))
  const address = ethers.utils.recoverAddress(digest, signature)
  try {
    return await isOwnerOrAllowedMaintainer(sld, address)
  } catch (ex) {
    console.error(ex)
    return false
  }
}
