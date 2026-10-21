"use client"
import { FC } from 'react'
import Modal from './Modal'
import AchievementsGrid from '../achievements/AchievementsGrid'
import Loader from '../Loader'
import useAchievementsModal from '@/app/hooks/useAchievementsModal'
import useAchievements from '@/app/hooks/useAchievements'

const AchievementsListModal: FC = () => {
  const { isOpen, onClose } = useAchievementsModal()
  const { achievements, isLoading } = useAchievements()

  const bodyContent = (
    <div className="w-full h-full px-6 pb-6">
      {isLoading ? <Loader /> : <AchievementsGrid achievements={achievements} />}
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Achievements"
      body={bodyContent}
    />
  )
}

export default AchievementsListModal
