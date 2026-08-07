/**
 * Icon set: Iconoir (MIT), adapted to the lucide-style API the app was built
 * with — every icon accepts `size` (square px) and `strokeWidth`, so call
 * sites didn't have to change when the set was swapped.
 */
import { ComponentType, SVGProps } from 'react'
import * as I from 'iconoir-react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }

function adapt(Icon: ComponentType<SVGProps<SVGSVGElement>>) {
  return function AdaptedIcon({ size = 24, strokeWidth, ...rest }: IconProps) {
    return <Icon width={size} height={size} strokeWidth={strokeWidth} {...rest} />
  }
}

export const Archive = adapt(I.Archive)
export const ArrowLeft = adapt(I.ArrowLeft)
export const CalendarDays = adapt(I.Calendar)
export const CalendarHeart = adapt(I.CalendarCheck)
export const Camera = adapt(I.Camera)
export const Check = adapt(I.Check)
export const CheckSquare = adapt(I.TaskList)
export const Compass = adapt(I.Compass)
export const Copy = adapt(I.Copy)
export const ExternalLink = adapt(I.OpenNewWindow)
export const Flame = adapt(I.FireFlame)
export const Heart = adapt(I.Heart)
export const Hourglass = adapt(I.Hourglass)
export const ImagePlus = adapt(I.MediaImagePlus)
export const Info = adapt(I.InfoCircle)
export const ListChecks = adapt(I.TaskList)
export const ListPlus = adapt(I.ListSelect)
export const ListTodo = adapt(I.List)
export const Lock = adapt(I.Lock)
export const LockOpen = adapt(I.LockSlash)
export const MapPin = adapt(I.MapPin)
export const MessageCircleQuestion = adapt(I.ChatBubbleQuestion)
export const Monitor = adapt(I.Computer)
export const Moon = adapt(I.HalfMoon)
export const MoreHorizontal = adapt(I.MoreHoriz)
export const NotebookPen = adapt(I.Notes)
export const Pencil = adapt(I.EditPencil)
export const Pin = adapt(I.Pin)
export const Plus = adapt(I.Plus)
export const RotateCcw = adapt(I.Refresh)
export const Search = adapt(I.Search)
export const Send = adapt(I.Send)
export const ShieldCheck = adapt(I.ShieldCheck)
export const Shuffle = adapt(I.Shuffle)
export const Smartphone = adapt(I.SmartphoneDevice)
export const SmilePlus = adapt(I.Emoji)
export const Sparkles = adapt(I.Sparks)
export const SpellCheck = adapt(I.Text)
export const StickyNote = adapt(I.Notes)
export const Sun = adapt(I.SunLight)
export const Trash2 = adapt(I.Trash)
export const UserPlus = adapt(I.UserPlus)
export const Users = adapt(I.Group)
export const WrapText = adapt(I.WrapText)
export const X = adapt(I.Xmark)
export const GripVertical = adapt(I.Drag)
export const Wallet = adapt(I.Wallet)
export const Mic = adapt(I.Microphone)
export const Square = adapt(I.Square)
export const ChevronDown = adapt(I.NavArrowDown)
export const LogOut = adapt(I.LogOut)
export const Share2 = adapt(I.ShareAndroid)
